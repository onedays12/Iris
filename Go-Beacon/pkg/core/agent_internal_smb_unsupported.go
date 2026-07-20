//go:build !windows

package core

import "fmt"

func (a *Agent) runInternalSMB() int {
	fmt.Println("[!] Internal SMB is only supported on windows")
	return -1
}
