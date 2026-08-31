package core

import (
	"beacon/pkg/profile"
	"fmt"
	"net"
	"time"
)

func (a *Agent) runInternalTCP() int {
	for a.shouldRunInternal() {
		addr := net.JoinHostPort(
			profile.GlobalProfile.TCPInternal.BindHost,
			fmt.Sprintf("%d", profile.GlobalProfile.TCPInternal.BindPort),
		)
		ln, err := net.Listen("tcp", addr)
		if err != nil {
			a.internalReconnectDelay()
			continue
		}

		conn, err := a.acceptInternalTCP(ln)
		_ = ln.Close()
		if err != nil {
			a.internalReconnectDelay()
			continue
		}
		if conn == nil {
			break
		}
		_ = a.runInternal(conn)
		a.internalReconnectDelay()
	}
	return 0
}

func (a *Agent) acceptInternalTCP(ln net.Listener) (net.Conn, error) {
	tcpLn, _ := ln.(*net.TCPListener)
	for a.shouldRunInternal() {
		if tcpLn != nil {
			_ = tcpLn.SetDeadline(time.Now().Add(time.Second))
		}

		conn, err := ln.Accept()
		if err == nil {
			return conn, nil
		}
		if ne, ok := err.(net.Error); ok && ne.Timeout() {
			continue
		}
		return nil, err
	}
	return nil, nil
}
