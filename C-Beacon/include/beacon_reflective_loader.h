#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <windows.h>

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

BEACON_REFLECTIVE_EXPORT ULONG_PTR WINAPI REFLoader(LPVOID lpParameter);

#ifdef __cplusplus
}
#endif
