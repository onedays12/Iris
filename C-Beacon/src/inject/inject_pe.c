#include "beacon_inject.h"

/* 校验 [off, off + count * elem_size) 是否完全落在映像内，并防止乘法/加法溢出。 */
static BOOL InjectRangeInImage(SIZE_T off, SIZE_T count, SIZE_T elem_size, SIZE_T image_size)
{
    SIZE_T bytes;

    if (elem_size != 0 && count > ((SIZE_T)-1) / elem_size) return FALSE;
    bytes = count * elem_size;
    if (off > image_size) return FALSE;
    if (bytes > image_size - off) return FALSE;
    return TRUE;
}

/* 在映像范围内比较 NUL 结尾字符串，避免畸形 PE 导出名越界读取。 */
static BOOL InjectStringEqualsInImage(const BYTE8* image, SIZE_T image_size,
                                      SIZE_T off, const CHAR* expected)
{
    SIZE_T i;
    SIZE_T max_len;

    if (!image || !expected || off >= image_size) return FALSE;
    max_len = image_size - off;

    for (i = 0; i < max_len; i++) {
        CHAR current = (CHAR)image[off + i];
        CHAR want = expected[i];

        if (want == '\0') return current == '\0';
        if (current == '\0' || current != want) return FALSE;
    }
    return FALSE;
}

/* 将 IMAGE_FILE_MACHINE_* 转为简短架构名，仅用于错误信息。 */
const CHAR* InjectMachineName(WORD machine)
{
    if (machine == IMAGE_FILE_MACHINE_AMD64) return "x64";
    if (machine == IMAGE_FILE_MACHINE_I386) return "x86";
    return "unknown";
}

/* 根据当前编译目标返回本地 Beacon 的 PE machine。 */
WORD InjectCurrentMachine(VOID)
{
#if defined(_M_X64) || defined(_M_AMD64)
    return IMAGE_FILE_MACHINE_AMD64;
#elif defined(_M_IX86)
    return IMAGE_FILE_MACHINE_I386;
#else
    return 0;
#endif
}

/* 解析协议层架构字符串，供 migrate/postex 做架构一致性校验。 */
WORD InjectMachineFromArch(const CHAR* arch)
{
    if (!arch) return 0;
    if (_stricmp(arch, "x64") == 0 || _stricmp(arch, "amd64") == 0) {
        return IMAGE_FILE_MACHINE_AMD64;
    }
    if (_stricmp(arch, "x86") == 0) {
        return IMAGE_FILE_MACHINE_I386;
    }
    return 0;
}

/* 把 PE 的 RVA 映射到文件 raw offset，适用于尚未加载的原始 PE bytes。 */
BOOL InjectRvaToRaw(PIMAGE_NT_HEADERS nt,
                    PIMAGE_SECTION_HEADER sections,
                    DWORD rva,
                    SIZE_T image_size,
                    DWORD* raw)
{
    WORD i;

    if (!nt || !sections || !raw) return FALSE;
    if (rva < nt->OptionalHeader.SizeOfHeaders &&
        InjectRangeInImage((SIZE_T)rva, 1, 1, image_size)) {
        *raw = rva;
        return TRUE;
    }

    for (i = 0; i < nt->FileHeader.NumberOfSections; ++i) {
        DWORD va = sections[i].VirtualAddress;
        DWORD size = sections[i].Misc.VirtualSize > sections[i].SizeOfRawData ?
                     sections[i].Misc.VirtualSize : sections[i].SizeOfRawData;
        if (size == 0) continue;
        if (rva >= va && (rva - va) < size) {
            SIZE_T off = (SIZE_T)sections[i].PointerToRawData + (SIZE_T)(rva - va);
            if (off <= (SIZE_T)MAXDWORD &&
                InjectRangeInImage(off, 1, 1, image_size)) {
                *raw = (DWORD)off;
                return TRUE;
            }
            return FALSE;
        }
    }

    return FALSE;
}

/* 从原始 PE bytes 中解析并校验 machine 字段。 */
BOOL InjectImageMachine(const ByteBuf* image,
                        const CHAR* label,
                        WORD* machine,
                        CHAR* err,
                        SIZE_T err_size)
{
    PIMAGE_DOS_HEADER dos;
    PIMAGE_NT_HEADERS nt;

    if (!label) label = "image";
    if (machine) *machine = 0;
    if (!image || !image->data || image->len < sizeof(IMAGE_DOS_HEADER) || !machine) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "invalid %s image", label);
        return FALSE;
    }

    dos = (PIMAGE_DOS_HEADER)image->data;
    if (dos->e_magic != IMAGE_DOS_SIGNATURE ||
        dos->e_lfanew <= 0 ||
        !InjectRangeInImage((SIZE_T)dos->e_lfanew, 1,
                            sizeof(DWORD) + sizeof(IMAGE_FILE_HEADER),
                            image->len)) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "invalid %s PE header", label);
        return FALSE;
    }

    nt = (PIMAGE_NT_HEADERS)(image->data + dos->e_lfanew);
    if (nt->Signature != IMAGE_NT_SIGNATURE) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "invalid %s NT header", label);
        return FALSE;
    }

    *machine = nt->FileHeader.Machine;
    if (*machine != IMAGE_FILE_MACHINE_AMD64 &&
        *machine != IMAGE_FILE_MACHINE_I386) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "unsupported %s machine: 0x%04x",
                             label, (UINT)*machine);
        return FALSE;
    }

    return TRUE;
}

/* 遍历 PE export table，返回指定导出函数在原始文件中的 offset。 */
BOOL InjectFindExportRawOffset(const BYTE8* image,
                               SIZE_T image_size,
                               const CHAR* export_name,
                               WORD required_machine,
                               DWORD* raw_offset)
{
    PIMAGE_DOS_HEADER dos;
    PIMAGE_NT_HEADERS nt;
    PIMAGE_SECTION_HEADER sections;
    IMAGE_DATA_DIRECTORY* dir;
    PIMAGE_EXPORT_DIRECTORY exports;
    DWORD export_raw;
    DWORD names_raw;
    DWORD ordinals_raw;
    DWORD functions_raw;
    DWORD* names;
    WORD* ordinals;
    DWORD* functions;
    DWORD i;
    SIZE_T section_off;

    if (!image || image_size < sizeof(IMAGE_DOS_HEADER) ||
        !export_name || !raw_offset) {
        return FALSE;
    }

    dos = (PIMAGE_DOS_HEADER)image;
    if (dos->e_magic != IMAGE_DOS_SIGNATURE ||
        dos->e_lfanew <= 0 ||
        !InjectRangeInImage((SIZE_T)dos->e_lfanew, 1,
                            sizeof(IMAGE_NT_HEADERS), image_size)) {
        return FALSE;
    }

    nt = (PIMAGE_NT_HEADERS)(image + dos->e_lfanew);
    if (nt->Signature != IMAGE_NT_SIGNATURE) return FALSE;
    if (required_machine && nt->FileHeader.Machine != required_machine) return FALSE;

    section_off = (SIZE_T)dos->e_lfanew + sizeof(DWORD) +
                  sizeof(IMAGE_FILE_HEADER) + nt->FileHeader.SizeOfOptionalHeader;
    if (nt->FileHeader.NumberOfSections == 0 ||
        section_off < (SIZE_T)dos->e_lfanew ||
        !InjectRangeInImage(section_off, nt->FileHeader.NumberOfSections,
                            sizeof(IMAGE_SECTION_HEADER), image_size)) {
        return FALSE;
    }

    sections = IMAGE_FIRST_SECTION(nt);
    dir = &nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT];
    if (!dir->VirtualAddress || !dir->Size) return FALSE;

    if (!InjectRvaToRaw(nt, sections, dir->VirtualAddress, image_size, &export_raw) ||
        !InjectRangeInImage((SIZE_T)export_raw, 1,
                            sizeof(IMAGE_EXPORT_DIRECTORY), image_size)) {
        return FALSE;
    }

    exports = (PIMAGE_EXPORT_DIRECTORY)(image + export_raw);
    if (!exports->NumberOfNames || !exports->AddressOfNames ||
        !exports->AddressOfNameOrdinals || !exports->AddressOfFunctions) {
        return FALSE;
    }

    if (!InjectRvaToRaw(nt, sections, exports->AddressOfNames, image_size, &names_raw) ||
        !InjectRvaToRaw(nt, sections, exports->AddressOfNameOrdinals, image_size, &ordinals_raw) ||
        !InjectRvaToRaw(nt, sections, exports->AddressOfFunctions, image_size, &functions_raw)) {
        return FALSE;
    }

    if (!InjectRangeInImage((SIZE_T)names_raw, exports->NumberOfNames,
                            sizeof(DWORD), image_size) ||
        !InjectRangeInImage((SIZE_T)ordinals_raw, exports->NumberOfNames,
                            sizeof(WORD), image_size) ||
        !InjectRangeInImage((SIZE_T)functions_raw, exports->NumberOfFunctions,
                            sizeof(DWORD), image_size)) {
        return FALSE;
    }

    names = (DWORD*)(image + names_raw);
    ordinals = (WORD*)(image + ordinals_raw);
    functions = (DWORD*)(image + functions_raw);

    for (i = 0; i < exports->NumberOfNames; ++i) {
        DWORD name_raw;
        WORD ordinal;
        DWORD func_rva;

        if (!InjectRvaToRaw(nt, sections, names[i], image_size, &name_raw) ||
            !InjectRangeInImage((SIZE_T)name_raw, 1, 1, image_size)) {
            continue;
        }
        if (!InjectStringEqualsInImage(image, image_size,
                                       (SIZE_T)name_raw, export_name)) {
            continue;
        }

        ordinal = ordinals[i];
        if (ordinal >= exports->NumberOfFunctions) return FALSE;
        func_rva = functions[ordinal];
        if (!InjectRvaToRaw(nt, sections, func_rva, image_size, raw_offset)) {
            return FALSE;
        }
        return InjectRangeInImage((SIZE_T)*raw_offset, 1, 1, image_size);
    }

    return FALSE;
}
