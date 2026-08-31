package main

import (
	"beacon/pkg/core"
)

func main() {
	agent, err := core.NewAgent()
	if err != nil {
		_ = err
		return
	}
	defer agent.Close()

	agent.Run()
}
