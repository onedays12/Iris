package main

import (
	"net"
	"sync"
)

type Link struct {
	ID       string
	Kind     string
	Endpoint string
	Conn     net.Conn

	sendMu sync.Mutex
}

func (l *Link) Write(msg Message) error {
	l.sendMu.Lock()
	defer l.sendMu.Unlock()
	return writeMessage(l.Conn, msg)
}

func (l *Link) WriteRaw(raw []byte) error {
	l.sendMu.Lock()
	defer l.sendMu.Unlock()
	return writeEncodedFrame(l.Conn, raw)
}

func (l *Link) Close() {
	if l != nil && l.Conn != nil {
		_ = l.Conn.Close()
	}
}
