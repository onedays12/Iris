package main

import (
	"debug/pe"
	"flag"
	"fmt"
	"log"
	"os"
)

func main() {
	var inPath string
	var outPath string
	var sectionName string

	flag.StringVar(&inPath, "in", "", "input PE path")
	flag.StringVar(&outPath, "out", "", "output raw section path")
	flag.StringVar(&sectionName, "section", ".text", "section name to extract")
	flag.Parse()

	if inPath == "" || outPath == "" {
		log.Fatalf("usage: extract_text -in stager_shellcode.exe -out stager_template_x64.bin [-section .text]")
	}

	f, err := pe.Open(inPath)
	if err != nil {
		log.Fatalf("open PE: %v", err)
	}
	defer f.Close()

	for _, section := range f.Sections {
		if section.Name != sectionName {
			continue
		}

		data, err := section.Data()
		if err != nil {
			log.Fatalf("read section %s: %v", sectionName, err)
		}
		rawSize := len(data)
		if section.VirtualSize > 0 && section.VirtualSize < uint32(len(data)) {
			data = data[:section.VirtualSize]
		}
		if err := os.WriteFile(outPath, data, 0o644); err != nil {
			log.Fatalf("write output: %v", err)
		}
		fmt.Printf("[+] extracted %s: raw=%d virtual=0x%X written=%d -> %s\n", section.Name, rawSize, section.VirtualSize, len(data), outPath)
		return
	}

	log.Fatalf("section %q not found", sectionName)
}
