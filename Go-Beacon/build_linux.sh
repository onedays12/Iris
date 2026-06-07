#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p bin

echo "[*] Running tests..."
CGO_ENABLED=1 go test ./...

echo "[*] Building Go Beacon linux/amd64..."
CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o bin/beacon_linux_amd64.elf .

echo "[*] Build complete."
echo "    bin/beacon_linux_amd64.elf"
