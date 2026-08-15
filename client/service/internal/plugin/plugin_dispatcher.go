package plugin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"irisclient/service/internal/args"
	"irisclient/service/internal/transport"
)

// 派发路径的结构化错误。后端只返回英文错误码/消息，由前端做本地化展示。
var (
	// ErrDispatchNetworkFailure 表示网络层失败（DNS/连接拒绝/超时），transport.ProxyResult.Status == 0。
	ErrDispatchNetworkFailure = errors.New("dispatch network failure")
	// ErrDispatchUnauthorized 表示 teamserver 返回 401，token 失效。
	ErrDispatchUnauthorized = errors.New("dispatch unauthorized")
	// ErrDispatchServerFailed 表示 teamserver 返回 5xx。
	ErrDispatchServerFailed = errors.New("dispatch server failure")
	// ErrDispatchUnexpectedHTML 表示 teamserver 返回了非 JSON 的 HTML 响应（路径错误或接口变更）。
	ErrDispatchUnexpectedHTML = errors.New("unexpected html response")
)

// dispatchAction 执行插件指定的动作，根据 kind 分流到 BOF 或 PostEx 派发路径。
// capabilities 白名单强制: 最终 command_id 必须落在插件声明的 capabilities.command_ids 内。
func (m *PluginManager) dispatchAction(ctx context.Context, plugin *PluginInstance, action PluginAction, payload map[string]any) error {
	beaconID := args.PickString(payload, "beacon_id")
	if beaconID == "" {
		return fmt.Errorf("beacon_id is required")
	}

	apiBase := args.PickString(payload, "api_base")
	if apiBase == "" {
		apiBase = "https://127.0.0.1:8080"
	}
	token := args.PickString(payload, "token")
	if token == "" {
		return fmt.Errorf("token is required")
	}

	checkCapability := func(commandID int) error {
		if plugin == nil || plugin.Manifest.Capabilities == nil {
			return nil
		}
		for _, allowed := range plugin.Manifest.Capabilities.CommandIDs {
			if allowed == commandID {
				return nil
			}
		}
		return fmt.Errorf("plugin %s is not allowed to dispatch command %d (capabilities.command_ids)", plugin.ID, commandID)
	}

	if normalizePluginActionKind(action.Kind) == "postex" {
		commandID := args.PickInt(payload, "command_id")
		if commandID <= 0 {
			commandID = action.CommandID
		}
		if commandID <= 0 {
			commandID = defaultPostExCommandID
		}
		if commandID != defaultPostExCommandID {
			return fmt.Errorf("postex plugin action %s must use command_id %d", action.ID, defaultPostExCommandID)
		}
		if err := checkCapability(commandID); err != nil {
			return err
		}

		cmdArgs, err := buildPostExPluginArgs(action, payload)
		if err != nil {
			return err
		}
		return dispatchBeaconCommand(ctx, apiBase, token, beaconID, commandID, cmdArgs)
	}

	commandID := args.PickInt(payload, "command_id")
	if commandID <= 0 {
		commandID = action.CommandID
	}
	if commandID <= 0 && actionHasArtifact(action) {
		commandID = defaultExecutionBOFCommandID
	}
	if commandID <= 0 {
		return fmt.Errorf("command_id is required for plugin action %s", action.ID)
	}
	if err := checkCapability(commandID); err != nil {
		return err
	}

	cmdArgs, err := buildPluginArgs(action, payload)
	if err != nil {
		return err
	}

	artifactData, hasArtifact, err := resolveActionArtifactData(action, payload)
	if err != nil {
		return err
	}
	if hasArtifact {
		artifactKind := "string"
		if commandID == defaultExecutionBOFCommandID {
			artifactKind = "bytes"
		}
		cmdArgs = append([]args.BeaconCommandArg{{Kind: artifactKind, Value: artifactData}}, cmdArgs...)
	}

	return dispatchBeaconCommand(ctx, apiBase, token, beaconID, commandID, cmdArgs)
}

// dispatchBeaconCommand 通过共享 ProxyService 把命令投递给 teamserver。
//
// 使用 DoRequestWithStatus 而非 DoRequest：结构化 transport.ProxyResult 携带 HTTP status，
// 让 classifyDispatchResult 能按状态码区分 401/5xx/网络失败/HTML，而非靠嗅探 body。
func dispatchBeaconCommand(ctx context.Context, apiBase, token, beaconID string, commandID int, cmdArgs []args.BeaconCommandArg) error {
	requestBody := map[string]any{
		"beacon_id": beaconID,
		"command":   commandID,
		"args":      cmdArgs,
	}
	bodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		return fmt.Errorf("marshal plugin command failed: %w", err)
	}

	proxy := transport.SharedProxyService()
	rawResult, err := proxy.DoRequestWithStatus(
		ctx,
		http.MethodPost,
		strings.TrimRight(apiBase, "/")+"/api/v1/beacon/command",
		string(bodyBytes),
		map[string]string{
			"Authorization": "Bearer " + token,
		},
	)
	if err != nil {
		return fmt.Errorf("dispatch plugin command failed: %w", err)
	}

	var result transport.ProxyResult
	if err := json.Unmarshal([]byte(rawResult), &result); err != nil {
		return fmt.Errorf("decode dispatch result failed: %w", err)
	}

	return classifyDispatchResult(result)
}

// classifyDispatchResult 按 transport.ProxyResult 的 status 与 body 判定是否为业务/网络错误。
//
// 判定顺序：
//  1. Status == 0          → 网络层失败（DNS/连接拒绝/超时/ctx 取消）
//  2. Status == 401        → token 失效
//  3. Status >= 500        → teamserver 内部错误
//  4. body 起始为 "<"      → 路径错误或接口变更，返回了 HTML
//  5. body 含 ok/error 字段 → 按 teamserver 业务字段判错
//  6. 其余                  → 视为成功
func classifyDispatchResult(result transport.ProxyResult) error {
	if result.Status == 0 {
		if result.Error != "" {
			return fmt.Errorf("%w: %s", ErrDispatchNetworkFailure, result.Error)
		}
		return ErrDispatchNetworkFailure
	}

	trimmed := strings.TrimSpace(result.Body)

	if result.Status == 401 {
		return fmt.Errorf("%w: %s", ErrDispatchUnauthorized, trimmed)
	}
	if result.Status >= 500 {
		return fmt.Errorf("%w: status=%d body=%s", ErrDispatchServerFailed, result.Status, trimmed)
	}

	// teamserver 业务错误通过 JSON 体里的 ok/error 字段表达
	if trimmed != "" {
		if strings.HasPrefix(trimmed, "<") {
			return fmt.Errorf("%w: status=%d", ErrDispatchUnexpectedHTML, result.Status)
		}

		var payload map[string]any
		if err := json.Unmarshal([]byte(trimmed), &payload); err == nil {
			if errMsg := args.PickString(payload, "error"); errMsg != "" {
				return errors.New(errMsg)
			}
			if okVal, exists := payload["ok"]; exists {
				if ok, isBool := okVal.(bool); isBool && !ok {
					msg := args.PickString(payload, "message")
					if msg == "" {
						msg = "command dispatch failed"
					}
					return errors.New(msg)
				}
			}
		}
	}
	return nil
}
