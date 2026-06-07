package main

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
)

const (
	frameMagic   uint32 = 0x43415331 // CAS1
	frameVersion uint16 = 1
	maxFrameSize        = 16 * 1024 * 1024
)

const (
	CmdHello uint16 = iota + 1
	CmdExec
	CmdResult
	CmdConnectTCP
	CmdLinkSMB
	CmdRoute
	CmdOpen
	CmdRead
	CmdDead
	CmdPing
)

type Message struct {
	Cmd    uint16
	TaskID uint32
	Src    string
	Child  string
	Body   []byte
}

func cmdName(cmd uint16) string {
	switch cmd {
	case CmdHello:
		return "HELLO"
	case CmdExec:
		return "EXEC"
	case CmdResult:
		return "RESULT"
	case CmdConnectTCP:
		return "CONNECT_TCP"
	case CmdLinkSMB:
		return "LINK_SMB"
	case CmdRoute:
		return "ROUTE"
	case CmdOpen:
		return "OPEN"
	case CmdRead:
		return "READ"
	case CmdDead:
		return "DEAD"
	case CmdPing:
		return "PING"
	default:
		return fmt.Sprintf("UNKNOWN(%d)", cmd)
	}
}

func encodeMessage(msg Message) ([]byte, error) {
	if len(msg.Src) > 0xffff {
		return nil, errors.New("src is too long")
	}
	if len(msg.Child) > 0xffff {
		return nil, errors.New("child is too long")
	}
	if len(msg.Body) > maxFrameSize {
		return nil, errors.New("body is too large")
	}

	var buf bytes.Buffer
	writeU32(&buf, frameMagic)
	writeU16(&buf, frameVersion)
	writeU16(&buf, msg.Cmd)
	writeU32(&buf, msg.TaskID)
	writeString(&buf, msg.Src)
	writeString(&buf, msg.Child)
	writeU32(&buf, uint32(len(msg.Body)))
	buf.Write(msg.Body)
	return buf.Bytes(), nil
}

func decodeMessage(raw []byte) (Message, error) {
	r := bytes.NewReader(raw)
	if readU32(r) != frameMagic {
		return Message{}, errors.New("invalid magic")
	}
	if readU16(r) != frameVersion {
		return Message{}, errors.New("unsupported version")
	}

	msg := Message{}
	msg.Cmd = readU16(r)
	msg.TaskID = readU32(r)

	var err error
	msg.Src, err = readString(r)
	if err != nil {
		return Message{}, err
	}
	msg.Child, err = readString(r)
	if err != nil {
		return Message{}, err
	}

	bodyLen := readU32(r)
	if bodyLen > maxFrameSize {
		return Message{}, errors.New("body is too large")
	}
	if uint32(r.Len()) < bodyLen {
		return Message{}, errors.New("truncated body")
	}
	msg.Body = make([]byte, bodyLen)
	if _, err := io.ReadFull(r, msg.Body); err != nil {
		return Message{}, err
	}
	return msg, nil
}

func readFrame(conn net.Conn) (Message, []byte, error) {
	var hdr [4]byte
	if _, err := io.ReadFull(conn, hdr[:]); err != nil {
		return Message{}, nil, err
	}

	length := binary.BigEndian.Uint32(hdr[:])
	if length == 0 || length > maxFrameSize {
		return Message{}, nil, fmt.Errorf("invalid frame length: %d", length)
	}

	raw := make([]byte, length)
	if _, err := io.ReadFull(conn, raw); err != nil {
		return Message{}, nil, err
	}

	msg, err := decodeMessage(raw)
	if err != nil {
		return Message{}, nil, err
	}
	return msg, raw, nil
}

func writeMessage(conn net.Conn, msg Message) error {
	raw, err := encodeMessage(msg)
	if err != nil {
		return err
	}
	return writeEncodedFrame(conn, raw)
}

func writeEncodedFrame(conn net.Conn, raw []byte) error {
	if len(raw) == 0 || len(raw) > maxFrameSize {
		return fmt.Errorf("invalid raw frame length: %d", len(raw))
	}

	var hdr [4]byte
	binary.BigEndian.PutUint32(hdr[:], uint32(len(raw)))
	if _, err := conn.Write(hdr[:]); err != nil {
		return err
	}
	_, err := conn.Write(raw)
	return err
}

func writeU16(buf *bytes.Buffer, v uint16) {
	var tmp [2]byte
	binary.BigEndian.PutUint16(tmp[:], v)
	buf.Write(tmp[:])
}

func writeU32(buf *bytes.Buffer, v uint32) {
	var tmp [4]byte
	binary.BigEndian.PutUint32(tmp[:], v)
	buf.Write(tmp[:])
}

func writeString(buf *bytes.Buffer, s string) {
	writeU16(buf, uint16(len(s)))
	buf.WriteString(s)
}

func readU16(r *bytes.Reader) uint16 {
	var tmp [2]byte
	if _, err := io.ReadFull(r, tmp[:]); err != nil {
		return 0
	}
	return binary.BigEndian.Uint16(tmp[:])
}

func readU32(r *bytes.Reader) uint32 {
	var tmp [4]byte
	if _, err := io.ReadFull(r, tmp[:]); err != nil {
		return 0
	}
	return binary.BigEndian.Uint32(tmp[:])
}

func readString(r *bytes.Reader) (string, error) {
	n := readU16(r)
	if int(n) > r.Len() {
		return "", errors.New("truncated string")
	}
	buf := make([]byte, n)
	if _, err := io.ReadFull(r, buf); err != nil {
		return "", err
	}
	return string(buf), nil
}
