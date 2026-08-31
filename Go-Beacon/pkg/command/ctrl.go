package command

import (
	"beacon/pkg/profile"
	"beacon/pkg/utils/packet"
	"fmt"
	"time"
)

// Sleep 动态调整 Beacon 的休眠时间
func Sleep(p *packet.Parser) ([]byte, error) {
	argCount := p.ParseInt32()
	if argCount == 0 {
		return nil, fmt.Errorf("sleep requires at least 1 argument (ms)")
	}

	// 参数 1: 休眠时间 (ms)
	sleepMs := int(p.ParseInt32())
	if p.HasError() {
		return nil, fmt.Errorf("invalid sleep time: %v", p.Error())
	}
	if sleepMs < 0 {
		return nil, fmt.Errorf("invalid sleep time: %d", sleepMs)
	}
	profile.GlobalProfile.SleepTime = time.Duration(sleepMs) * time.Millisecond

	// 参数 2: 抖动比例 (%)
	jitter := profile.GlobalProfile.Jitter
	if argCount >= 2 {
		jitterVal := int(p.ParseInt32())
		if p.HasError() {
			return nil, fmt.Errorf("invalid jitter: %v", p.Error())
		}
		jitter = jitterVal
		if jitter < 0 || jitter > 100 {
			return nil, fmt.Errorf("invalid jitter percentage: %d", jitter)
		}
		profile.GlobalProfile.Jitter = jitter
	}

	result := []byte("Sleep policy updated")
	return packet.PackArray([]any{result})
}

// Exit 返回确认消息，告知服务端 Beacon 即将退出。
// 实际的退出操作由 main 循环在发送完结果后执行。
func Exit(p *packet.Parser) ([]byte, error) {
	result := []byte("Beacon exit command processed. Goodbye.")
	return packet.PackArray([]any{result})
}
