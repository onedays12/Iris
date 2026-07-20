//go:build windows

package cascade

import (
	"time"

	"github.com/Microsoft/go-winio"
)

func DialSMB(pipePath string, timeout time.Duration) (Link, error) {
	if timeout <= 0 {
		return winio.DialPipe(pipePath, nil)
	}
	return winio.DialPipe(pipePath, &timeout)
}

func ListenSMB(pipeName string) (Link, error) {
	ln, err := winio.ListenPipe(pipeName, &winio.PipeConfig{
		InputBufferSize:  65536,
		OutputBufferSize: 65536,
		MessageMode:      false,
	})
	if err != nil {
		return nil, err
	}
	defer ln.Close()

	return ln.Accept()
}
