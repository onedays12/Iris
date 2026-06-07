# Linux ELF BOF

This plugin exposes the Linux amd64 ELF BOF loader stress sample from `D:\代码\go\beacon\examples\elf_bof`.

The action sends command `70` with:

- `bytes`: `bin/loader_stress.o`
- declared BOF arg specs: `int32 1234`, `short 77`, and `string "hello-elf-bof"`

TeamServer is responsible for converting those arg specs into BOF packed args. The plugin is intentionally limited to Linux amd64 beacons.
