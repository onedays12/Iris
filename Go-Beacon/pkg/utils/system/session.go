package system

// GetCurrentSessionId 获取当前进程的 Session ID。
// 在 Windows 下用于识别 Session 0 (服务/系统环境)。
func GetCurrentSessionId() (int, error) {
	return getCurrentSessionId()
}
