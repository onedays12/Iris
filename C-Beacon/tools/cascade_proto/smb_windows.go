//go:build windows

package main

import (
	"fmt"
	"net"
	"time"

	"github.com/Microsoft/go-winio"
)

func listenPipe(path string, onConn func(net.Conn, string, string)) error {
	ln, err := winio.ListenPipe(path, &winio.PipeConfig{
		MessageMode:      false,
		InputBufferSize:  65536,
		OutputBufferSize: 65536,
	})
	if err != nil {
		return err
	}
	fmt.Printf("[smb] listening on %s\n", path)

	for {
		conn, err := ln.Accept()
		if err != nil {
			fmt.Printf("[smb] accept failed: %v\n", err)
			continue
		}
		go onConn(conn, "smb", path)
	}
}

func dialPipe(path string) (net.Conn, error) {
	timeout := 10 * time.Second
	return winio.DialPipe(path, &timeout)
}
