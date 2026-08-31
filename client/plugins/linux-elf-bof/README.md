# Linux ELF BOF

[中文](README.md) · [English](README.en.md)

给 Linux amd64 beacon 用的 ELF BOF 样例。编法、API、限制看 [docs/linux-elf-bof.md](../../docs/linux-elf-bof.md)。动作走命令 `70`：

- `bytes`：`bin/loader_stress.o`
- 声明的 BOF 参数：`int32 1234`、`short 77`、`string "hello-elf-bof"`

参数怎么打成 BOF packed args，是 TeamServer 的事。这个插件故意只对 Linux amd64 露出菜单。
