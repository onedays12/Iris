#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p bin

echo "[*] Running tests..."
CGO_ENABLED=1 go test ./...

echo "[*] Building Go Beacon linux/amd64..."
CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o bin/beacon_http_external_linux_amd64.elf .
CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o bin/beacon_tcp_internal_linux_amd64.elf .
CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o bin/beacon_smb_internal_linux_amd64.elf .

echo "[*] Build complete."
echo "    bin/beacon_http_external_linux_amd64.elf"
echo "    bin/beacon_tcp_internal_linux_amd64.elf"
echo "    bin/beacon_smb_internal_linux_amd64.elf"
