//go:build windows

package main

import "syscall"

var (
	kernel32             = syscall.NewLazyDLL("kernel32.dll")
	procFreeConsole      = kernel32.NewProc("FreeConsole")
	procGetConsoleWindow = kernel32.NewProc("GetConsoleWindow")
)

func init() {
	hwnd, _, _ := procGetConsoleWindow.Call()
	if hwnd != 0 {
		_, _, _ = procFreeConsole.Call()
	}
}
