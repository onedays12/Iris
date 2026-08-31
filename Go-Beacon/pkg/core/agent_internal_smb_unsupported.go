//go:build !windows

package core

func (a *Agent) runInternalSMB() int {
	return -1
}
