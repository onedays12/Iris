package main

import (
	"beacon/pkg/core"
	"fmt"
)

func main() {
	agent, err := core.NewAgent()
	if err != nil {
		fmt.Printf("[!] Beacon init failed: %v\n", err)
		return
	}
	defer agent.Close()

	agent.Run()
}
