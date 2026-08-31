# 插件

[中文](README.md) · [English](README.en.md)

怎么写 `plugin.json`、字段怎么推、哈希怎么填，都在 [docs/plugins.md](../docs/plugins.md)（[English](../docs/plugins.en.md)）。

这个目录放插件本身。每个子目录一份 `plugin.json`，Client 启动时加载。仓库里带着两个例子：

- [linux-elf-bof](linux-elf-bof/)：Linux amd64 ELF BOF
- [postex-template](postex-template/)：PostEx spawn / inject 模板
