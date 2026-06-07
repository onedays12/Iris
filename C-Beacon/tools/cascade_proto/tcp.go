package main

import (
	"fmt"
	"net"
	"time"
)

func listenTCP(addr string, onConn func(net.Conn, string, string)) error {
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	fmt.Printf("[tcp] listening on %s\n", addr)

	for {
		conn, err := ln.Accept()
		if err != nil {
			fmt.Printf("[tcp] accept failed: %v\n", err)
			continue
		}
		go onConn(conn, "tcp", conn.RemoteAddr().String())
	}
}

func dialTCP(addr string) (net.Conn, error) {
	return net.DialTimeout("tcp", addr, 10*time.Second)
}
