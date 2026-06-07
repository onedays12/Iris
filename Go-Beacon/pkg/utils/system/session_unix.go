//go:build !windows
package system

func getCurrentSessionId() (int, error) {
	// Unix 系系统通常没有 Session 0 图形隔离限制
	return 1, nil
}
