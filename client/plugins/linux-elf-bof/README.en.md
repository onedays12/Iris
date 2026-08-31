# Linux ELF BOF

[中文](README.md) · [English](README.en.md)

ELF BOF sample for Linux amd64 beacons. Compile flags, APIs, limits: [docs/linux-elf-bof.en.md](../../docs/linux-elf-bof.en.md). The action uses command `70`:

- `bytes`: `bin/loader_stress.o`
- declared BOF args: `int32 1234`, `short 77`, `string "hello-elf-bof"`

TeamServer packs those into BOF args. This plugin only shows up on Linux amd64.
