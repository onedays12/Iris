#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p bin

echo "[*] Building Go Beacon darwin/arm64..."
CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o bin/beacon_mac_arm.macho .

echo "[*] Build complete."
echo "    bin/beacon_mac_arm.macho"
