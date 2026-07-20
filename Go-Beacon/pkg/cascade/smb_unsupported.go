//go:build !windows

package cascade

import (
	"errors"
	"time"
)

func DialSMB(pipePath string, timeout time.Duration) (Link, error) {
	return nil, errors.New("smb cascade is only supported on windows")
}

func ListenSMB(pipeName string) (Link, error) {
	return nil, errors.New("smb internal listener is only supported on windows")
}
