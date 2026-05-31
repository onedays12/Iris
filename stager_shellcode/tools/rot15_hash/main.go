package main

import (
	"encoding/binary"
	"flag"
	"fmt"
	"os"
	"strings"
	"unicode/utf16"
)

func ror32(value uint32, shift uint) uint32 {
	return (value >> shift) | (value << (32 - shift))
}

func hashFunction(name string) uint32 {
	var h uint32
	for i := 0; i < len(name); i++ {
		h = ror32(h, 15)
		h += uint32(name[i])
	}
	return h
}

func hashModule(name string) uint32 {
	var h uint32
	wide := utf16.Encode([]rune(name))
	buf := make([]byte, 2)

	for _, ch := range wide {
		binary.LittleEndian.PutUint16(buf, ch)
		for _, b := range buf {
			if b >= 'a' && b <= 'z' {
				b -= 'a' - 'A'
			}
			h = ror32(h, 15)
			h += uint32(b)
		}
	}
	return h
}

func main() {
	var equ bool

	flag.BoolVar(&equ, "equ", false, "print MASM equ format")
	flag.Parse()

	if flag.NArg() != 2 {
		fmt.Fprintf(os.Stderr, "usage: rot15_hash [-equ] <module.dll> <FunctionName>\n")
		os.Exit(1)
	}

	module := flag.Arg(0)
	function := flag.Arg(1)
	moduleHash := hashModule(module)
	functionHash := hashFunction(function)
	combined := moduleHash + functionHash

	if equ {
		name := strings.ToUpper(strings.TrimSuffix(module, ".dll"))
		name = strings.NewReplacer(".", "_", "-", "_").Replace(name)
		fmt.Printf("HASH_%s_%s equ 0%08Xh\n", name, strings.ToUpper(function), combined)
		return
	}

	fmt.Printf("module_hash   0x%08X  %s\n", moduleHash, module)
	fmt.Printf("function_hash 0x%08X  %s\n", functionHash, function)
	fmt.Printf("combined      0x%08X  %s!%s\n", combined, module, function)
}
