// Package cascade implements the parent/child cascade frame wire format.
package cascade

import (
	"encoding/binary"
	"errors"
	"io"
)

const (
	ProtocolTCP uint32 = 1
	ProtocolSMB uint32 = 2

	FrameHello  uint16 = 1
	FrameTask   uint16 = 2
	FrameResult uint16 = 3
	FramePing   uint16 = 4
	FrameClose  uint16 = 5

	frameMagic      = 0x43415331
	frameVersion    = 1
	MaxFrameSize    = 16 * 1024 * 1024
	ReadBufferBytes = 8192
)

type Link interface {
	io.Reader
	io.Writer
	Close() error
}

func ReadFrame(r io.Reader) (uint16, []byte, error) {
	var header [16]byte
	if _, err := io.ReadFull(r, header[:]); err != nil {
		return 0, nil, err
	}

	length := binary.BigEndian.Uint32(header[0:4])
	magic := binary.BigEndian.Uint32(header[4:8])
	version := binary.BigEndian.Uint16(header[8:10])
	cmd := binary.BigEndian.Uint16(header[10:12])
	bodyLen := binary.BigEndian.Uint32(header[12:16])

	if magic != frameMagic || version != frameVersion {
		return 0, nil, errors.New("invalid cascade frame header")
	}
	if length < 12 || length > MaxFrameSize || bodyLen != length-12 {
		return 0, nil, errors.New("invalid cascade frame length")
	}

	body := make([]byte, bodyLen)
	if _, err := io.ReadFull(r, body); err != nil {
		return 0, nil, err
	}
	return cmd, body, nil
}

func WriteFrame(w io.Writer, cmd uint16, body []byte) error {
	if len(body) > MaxFrameSize-12 {
		return errors.New("cascade frame body too large")
	}

	frame := make([]byte, 16+len(body))
	binary.BigEndian.PutUint32(frame[0:4], uint32(12+len(body)))
	binary.BigEndian.PutUint32(frame[4:8], frameMagic)
	binary.BigEndian.PutUint16(frame[8:10], frameVersion)
	binary.BigEndian.PutUint16(frame[10:12], cmd)
	binary.BigEndian.PutUint32(frame[12:16], uint32(len(body)))
	copy(frame[16:], body)

	for len(frame) > 0 {
		n, err := w.Write(frame)
		if err != nil {
			return err
		}
		if n == 0 {
			return io.ErrShortWrite
		}
		frame = frame[n:]
	}
	return nil
}
