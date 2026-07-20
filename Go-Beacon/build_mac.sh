#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p bin

echo "[*] Building Go Beacon darwin/arm64..."
CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o bin/beacon_http_external_mac_arm.macho .
CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o bin/beacon_tcp_internal_mac_arm.macho .
CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o bin/beacon_smb_internal_mac_arm.macho .

echo "[*] Build complete."
echo "    bin/beacon_http_external_mac_arm.macho"
echo "    bin/beacon_tcp_internal_mac_arm.macho"
echo "    bin/beacon_smb_internal_mac_arm.macho"
