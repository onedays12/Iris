package command

import (
	"beacon/pkg/utils/packet"
	"fmt"
)

// TunnelControlCommand 处理来自服务端的控制指令 (CommandId=61)。
type TunnelControlCommand struct {
	Action string // 预设动作 (用于显式关闭 63)
}

func (c *TunnelControlCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	return nil, fmt.Errorf("TunnelControl should be handled specially in Handler")
}

func HandleTunnelControlTask(runtime *TunnelRuntime, p *packet.Parser) ([][]byte, error) {
	return handleTunnelControlTask(runtime, p, "")
}

func handleTunnelControlTask(runtime *TunnelRuntime, p *packet.Parser, actionOverride string) ([][]byte, error) {
	if runtime == nil {
		return nil, fmt.Errorf("tunnel runtime is not initialized")
	}

	req, err := ParseTunnelControl(p)
	if err != nil {
		return nil, err
	}

	// 如果指定了预设动作 (如 63 强制关闭)，优先执行
	action := req.Action
	if actionOverride != "" {
		action = actionOverride
	}

	ch, ok := runtime.Get(req.TunnelID, req.ChannelID)
	if !ok {
		return nil, fmt.Errorf("channel %s/%s not found", req.TunnelID, req.ChannelID)
	}

	switch action {
	case "pause":
		ch.SetPaused(true)
	case "resume":
		ch.SetPaused(false)
	case "close":
		ch.Close()
		runtime.Remove(req.TunnelID, req.ChannelID)
	default:
		return nil, fmt.Errorf("unknown tunnel action: %s", action)
	}

	// 显式确认 (ACK): 回传相同的动作表示执行成功
	sendControlPacket(runtime, req.TunnelID, req.ChannelID, action, TunnelReasonNone, nil)

	return nil, nil
}

func HandleTunnelCloseTask(runtime *TunnelRuntime, p *packet.Parser) ([][]byte, error) {
	return handleTunnelControlTask(runtime, p, "close")
}
