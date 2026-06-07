// Package packet 实现 Beacon 的二进制线协议。
// 所有多字节整数采用大端序（Big-Endian），字符串以 [uint32 长度][null-terminated 内容] 编码。
package packet

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"strings"
)

// PackBytes 将字节切片打包为 [uint32 长度][原始数据] 格式。
func PackBytes(b []byte) []byte {
	buf := new(bytes.Buffer)
	binary.Write(buf, binary.BigEndian, uint32(len(b)))
	buf.Write(b)
	return buf.Bytes()
}

// PackArray 将多种数据类型按大端序打包为单个字节切片。
// 支持的类型：[]byte（原样拼接）、string（uint32 长度前缀 + null 结尾）、
// int8/uint8（1 字节）、int16（2 字节）、int32/uint32（4 字节）、
// int64/uint64（8 字节）、bool（1 字节，0 或 1）。
func PackArray(array []any) ([]byte, error) {
	var packData []byte

	for i := range array {
		switch v := array[i].(type) {

		case []byte:
			// 原始字节：直接拼接（无长度前缀，由调用方负责）
			packData = append(packData, v...)

		case string:
			// 字符串：uint32 长度前缀 + null 结尾的内容
			val := v
			if len(val) != 0 {
				if !strings.HasSuffix(val, "\x00") {
					val += "\x00"
				}
			}
			size := make([]byte, 4)
			binary.BigEndian.PutUint32(size, uint32(len(val)))
			packData = append(packData, size...)
			packData = append(packData, []byte(val)...)

		case int8:
			packData = append(packData, byte(v))
		case uint8:
			packData = append(packData, v)

		case int16:
			num := make([]byte, 2)
			binary.BigEndian.PutUint16(num, uint16(v))
			packData = append(packData, num...)

		case int32:
			num := make([]byte, 4)
			binary.BigEndian.PutUint32(num, uint32(v))
			packData = append(packData, num...)
		case uint32:
			num := make([]byte, 4)
			binary.BigEndian.PutUint32(num, v)
			packData = append(packData, num...)

		case int64:
			num := make([]byte, 8)
			binary.BigEndian.PutUint64(num, uint64(v))
			packData = append(packData, num...)
		case uint64:
			num := make([]byte, 8)
			binary.BigEndian.PutUint64(num, v)
			packData = append(packData, num...)

		case bool:
			var bt byte = 0
			if v {
				bt = 1
			}
			packData = append(packData, bt)

		default:
			return nil, errors.New("PackArray unknown type")
		}
	}
	return packData, nil
}

// MakeFinalPacket 组装最终响应包：外层 [uint32 长度][taskId + commandId + payload]。
// 格式：PackBytes(PackArray([int32 taskId, int32 commandId, PackBytes(data)]))
func MakeFinalPacket(taskId uint32, commandId uint32, data []byte) []byte {
	if data == nil {
		data = []byte{}
	}

	array := []interface{}{
		int32(taskId),
		int32(commandId),
		PackBytes(data),
	}

	packData, err := PackArray(array)
	if err != nil {
		return nil
	}

	return PackBytes(packData)
}

// Parser 将二进制数据按大端序解析回 Go 类型。
// 解析过程中任何错误都会被捕获，调用方通过 HasError() 检查。
type Parser struct {
	buffer []byte
	err    error
}

// CreateParser 创建一个 Parser，从 buffer 中顺序读取数据。
func CreateParser(buffer []byte) *Parser {
	return &Parser{
		buffer: buffer,
	}
}

// Size 返回 Parser 中剩余未读取的字节数。
func (p *Parser) Size() int {
	return len(p.buffer)
}

// HasError 返回解析过程中是否发生了错误。
func (p *Parser) HasError() bool {
	return p.err != nil
}

// Error 返回解析过程中遇到的第一个错误。
func (p *Parser) Error() error {
	return p.err
}

// ParseInt8 读取 1 字节并返回 uint8。
func (p *Parser) ParseInt8() uint8 {
	if p.err != nil || len(p.buffer) < 1 {
		p.err = errors.New("not enough data for int8")
		return 0
	}
	val := p.buffer[0]
	p.buffer = p.buffer[1:]
	return val
}

// ParseInt16 读取 2 字节并返回大端序 uint16。
func (p *Parser) ParseInt16() uint16 {
	if p.err != nil || len(p.buffer) < 2 {
		p.err = errors.New("not enough data for int16")
		return 0
	}
	val := binary.BigEndian.Uint16(p.buffer[:2])
	p.buffer = p.buffer[2:]
	return val
}

// ParseInt32 读取 4 字节并返回大端序 uint32。
func (p *Parser) ParseInt32() uint32 {
	if p.err != nil || len(p.buffer) < 4 {
		p.err = errors.New("not enough data for int32")
		return 0
	}
	val := binary.BigEndian.Uint32(p.buffer[:4])
	p.buffer = p.buffer[4:]
	return val
}

// ParseInt64 读取 8 字节并返回大端序 uint64。
func (p *Parser) ParseInt64() uint64 {
	if p.err != nil || len(p.buffer) < 8 {
		p.err = errors.New("not enough data for int64")
		return 0
	}
	val := binary.BigEndian.Uint64(p.buffer[:8])
	p.buffer = p.buffer[8:]
	return val
}

// ParseBytes 读取一个长度前缀的字节块：先读 uint32 长度，再读对应字节数。
func (p *Parser) ParseBytes() []byte {
	size := p.ParseInt32()
	if p.err != nil || uint32(len(p.buffer)) < size {
		p.err = errors.New("not enough data for bytes")
		return nil
	}
	b := p.buffer[:size]
	p.buffer = p.buffer[size:]
	return b
}

// ParseString 读取一个长度前缀的字节块并去除 null 结尾，返回字符串。
func (p *Parser) ParseString() string {
	b := p.ParseBytes()
	if p.err != nil {
		return ""
	}
	return string(bytes.Trim(b, "\x00"))
}

// ParseBool 读取 1 字节，非零值返回 true。
func (p *Parser) ParseBool() bool {
	if p.err != nil || len(p.buffer) < 1 {
		p.err = errors.New("not enough data for bool")
		return false
	}
	val := p.buffer[0]
	p.buffer = p.buffer[1:]
	return val != 0
}

// MinHeartbeatSessionKeySize 心跳包中会话密钥的最小长度。
const MinHeartbeatSessionKeySize = 16

// HeartbeatPlaintext 是心跳包解密后的明文结构。
// 线格式：beacon_id(4 bytes) + session_key_len(2 bytes) + session_key + payload。
type HeartbeatPlaintext struct {
	BeaconID   string
	SessionKey []byte
	Payload    []byte
}

// PackHeartbeat 组装心跳明文：beacon_id + session_key 长度 + session_key + payload。
func PackHeartbeat(beaconID uint32, sessionKey []byte, payload []byte) ([]byte, error) {
	if len(sessionKey) < MinHeartbeatSessionKeySize {
		return nil, fmt.Errorf("session key must be at least %d bytes", MinHeartbeatSessionKeySize)
	}
	if len(sessionKey) > 0xffff {
		return nil, errors.New("session key is too large")
	}

	return PackArray([]any{
		int32(beaconID),
		int16(len(sessionKey)),
		sessionKey,
		payload,
	})
}
