package command

import (
	"beacon/pkg/utils/packet"
	"time"
)

// TunnelDataCommand 处理来自服务端的数据负载 (CommandId=62)。
type TunnelDataCommand struct{}

func (c *TunnelDataCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	return nil, nil
}

func HandleTunnelDataTask(runtime *TunnelRuntime, p *packet.Parser) ([][]byte, error) {
	if runtime == nil {
		return nil, nil
	}

	req, err := ParseTunnelData(p)
	if err != nil {
		return nil, err
	}

	ch, ok := runtime.Get(req.TunnelID, req.ChannelID)
	if !ok {
		// 如果通道不存在，可能已经关闭，直接丢弃
		return nil, nil
	}

	if len(req.Data) > 0 {
		if ch.TargetConn != nil {
			_, err = ch.Write(req.Data)
			if err != nil {
				if ch.Closed.Load() {
					return nil, err
				}
				// 写入失败，通知服务端关闭通道 (Action: "close")
				sendControlPacket(runtime, req.TunnelID, req.ChannelID, "close", mapTunnelError(err), nil)
				ch.Close()
				runtime.Remove(req.TunnelID, req.ChannelID)
				return nil, err
			}
			ch.TouchLastSeen(time.Now())
		}
	}

	return nil, nil
}
