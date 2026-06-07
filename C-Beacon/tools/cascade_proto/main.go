package main

import (
	"flag"
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(1)
	}

	switch os.Args[1] {
	case "root":
		if err := NewRoot().Run(); err != nil {
			fmt.Println("root failed:", err)
			os.Exit(1)
		}
	case "node":
		runNode(os.Args[2:])
	default:
		usage()
		os.Exit(1)
	}
}

func runNode(args []string) {
	fs := flag.NewFlagSet("node", flag.ExitOnError)
	id := fs.String("id", "", "node id")
	tcpListen := fs.String("tcp-listen", "", "tcp listen address, for example 127.0.0.1:9001")
	pipe := fs.String("pipe", "", `named pipe path, for example \\.\pipe\beacon_b`)
	_ = fs.Parse(args)

	if *id == "" {
		fmt.Println("node requires --id")
		os.Exit(1)
	}
	if err := NewNode(*id).Run(*tcpListen, *pipe); err != nil {
		fmt.Println("node failed:", err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Println("usage:")
	fmt.Println("  cascade_proto.exe root")
	fmt.Println("  cascade_proto.exe node --id B --tcp-listen 127.0.0.1:9001")
	fmt.Println(`  cascade_proto.exe node --id B --pipe \\.\pipe\beacon_b`)
}
