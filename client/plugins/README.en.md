# Plugins

[中文](README.md) · [English](README.en.md)

How to write `plugin.json`, which fields get inferred, how hashes work: [docs/plugins.en.md](../docs/plugins.en.md).

This directory holds the plugins themselves. One `plugin.json` per subdirectory. Client loads them on startup. Two samples ship in the repo:

- [linux-elf-bof](linux-elf-bof/README.en.md): Linux amd64 ELF BOF
- [postex-template](postex-template/README.en.md): PostEx spawn / inject template
