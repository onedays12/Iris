#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p bin

CFLAGS="-fPIC -fno-stack-protector -fno-asynchronous-unwind-tables -fno-unwind-tables -fno-exceptions -O0 -Wall -Wextra -I."

echo "[*] Building loader_stress.o ..."
gcc -c $CFLAGS loader_stress.c -o bin/loader_stress.o

echo "[*] Building hello.o ..."
gcc -c $CFLAGS hello.c -o bin/hello.o

echo "[*] Building sleep_loop.o ..."
gcc -c $CFLAGS sleep_loop.c -o bin/sleep_loop.o

echo "[*] Building global_common.o (default, may produce COMMON symbols) ..."
gcc -c $CFLAGS global_common.c -o bin/global_common.o

echo "[*] Building global_common_nocommon.o (-fno-common, BSS instead) ..."
gcc -c $CFLAGS -fno-common global_common.c -o bin/global_common_nocommon.o

echo ""
echo "[*] Verifying ELF headers ..."
for obj in bin/*.o; do
    echo "--- $obj ---"
    readelf -h "$obj" | grep -E 'Class|Type|Machine' || true
done

echo ""
echo "[*] Checking for COMMON symbols ..."
readelf -s bin/global_common.o | grep -i common || echo "  (no COMMON symbols)"

echo ""
echo "[*] Relocation summary ..."
for obj in bin/*.o; do
    count=$(readelf -r "$obj" 2>/dev/null | grep -c 'R_X86_64' || true)
    echo "  $obj: $count relocations"
done

echo ""
echo "[*] Build complete. Objects in examples/elf_bof/bin/"
ls -la bin/*.o
