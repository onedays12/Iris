#include <stdint.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <dlfcn.h>
#include <pthread.h>

#include "_cgo_export.h"

typedef void (*elfbof_entry_t)(char*, int);

typedef struct {
    char* original;
    char* buffer;
    int length;
    int size;
} bof_datap;

typedef struct {
    char* original;
    char* buffer;
    int length;
    int size;
} bof_formatp;

typedef struct bof_value_node {
    char* key;
    void* value;
    struct bof_value_node* next;
} bof_value_node;

/* dlsym cache entry */
typedef struct dlsym_cache_node {
    char* name;
    void* addr;
    struct dlsym_cache_node* next;
} dlsym_cache_node;

static __thread uintptr_t g_runtime_id;

/* Value store with mutex protection */
static bof_value_node* g_values;
static pthread_mutex_t g_values_mutex = PTHREAD_MUTEX_INITIALIZER;

/* dlsym cache with mutex protection */
static void* g_libc_handle;
static dlsym_cache_node* g_dlsym_cache;
static pthread_mutex_t g_dlsym_cache_mutex = PTHREAD_MUTEX_INITIALIZER;

extern char **environ;

static uint32_t read_le32(const char* p) {
    const unsigned char* b = (const unsigned char*)p;
    return ((uint32_t)b[0]) | ((uint32_t)b[1] << 8) | ((uint32_t)b[2] << 16) | ((uint32_t)b[3] << 24);
}

static uint16_t read_le16(const char* p) {
    const unsigned char* b = (const unsigned char*)p;
    return ((uint16_t)b[0]) | ((uint16_t)b[1] << 8);
}

static char* bof_strdup(const char* s) {
    size_t len = strlen(s) + 1;
    char* out = (char*)malloc(len);
    if (!out) {
        return NULL;
    }
    memcpy(out, s, len);
    return out;
}

void elfbof_call_go(void* entry, char* args, int len, uintptr_t runtime_id) {
    g_runtime_id = runtime_id;
    ((elfbof_entry_t)entry)(args, len);
    g_runtime_id = 0;
}

/* Cached dlsym: first checks our cache, then dlsym(RTLD_DEFAULT), then libc.so.6 */
void* elfbof_dlsym(char* name) {
    void* result;

    /* 1. Check cache */
    pthread_mutex_lock(&g_dlsym_cache_mutex);
    dlsym_cache_node* cur = g_dlsym_cache;
    while (cur) {
        if (strcmp(cur->name, name) == 0) {
            result = cur->addr;
            pthread_mutex_unlock(&g_dlsym_cache_mutex);
            return result;
        }
        cur = cur->next;
    }
    pthread_mutex_unlock(&g_dlsym_cache_mutex);

    /* 2. Try RTLD_DEFAULT (searches all loaded shared objects) */
    result = dlsym(RTLD_DEFAULT, name);
    if (result) {
        goto cache_and_return;
    }

    /* 3. Try libc.so.6 (cached handle) */
    pthread_mutex_lock(&g_dlsym_cache_mutex);
    if (!g_libc_handle) {
        g_libc_handle = dlopen("libc.so.6", RTLD_LAZY | RTLD_LOCAL);
    }
    pthread_mutex_unlock(&g_dlsym_cache_mutex);

    if (g_libc_handle) {
        result = dlsym(g_libc_handle, name);
        if (result) {
            goto cache_and_return;
        }
    }

    return NULL;

cache_and_return:
    {
        dlsym_cache_node* node = (dlsym_cache_node*)calloc(1, sizeof(dlsym_cache_node));
        if (node) {
            node->name = bof_strdup(name);
            node->addr = result;
            pthread_mutex_lock(&g_dlsym_cache_mutex);
            node->next = g_dlsym_cache;
            g_dlsym_cache = node;
            pthread_mutex_unlock(&g_dlsym_cache_mutex);
        }
    }
    return result;
}

void BeaconOutput(int type, char* data, int len) {
    (void)type;
    if (data && len > 0) {
        elfbofEmit((uintptr_t)g_runtime_id, data, len);
    }
}

void BeaconPrintf(int type, const char* fmt, ...) {
    (void)type;
    if (!fmt) {
        return;
    }

    char stack_buf[4096];
    va_list ap;
    va_start(ap, fmt);
    int n = vsnprintf(stack_buf, sizeof(stack_buf), fmt, ap);
    va_end(ap);

    if (n <= 0) {
        return;
    }
    if ((size_t)n < sizeof(stack_buf)) {
        elfbofEmit((uintptr_t)g_runtime_id, stack_buf, n);
        return;
    }

    char* heap_buf = (char*)malloc((size_t)n + 1);
    if (!heap_buf) {
        return;
    }
    va_start(ap, fmt);
    int n2 = vsnprintf(heap_buf, (size_t)n + 1, fmt, ap);
    va_end(ap);
    if (n2 > 0) {
        elfbofEmit((uintptr_t)g_runtime_id, heap_buf, n2);
    }
    free(heap_buf);
}

void BeaconDataParse(bof_datap* parser, char* buffer, int size) {
    if (!parser || !buffer || size < 4) {
        return;
    }
    parser->original = buffer;
    parser->buffer = buffer + 4;
    parser->length = size - 4;
    parser->size = size - 4;
}

int BeaconDataInt(bof_datap* parser) {
    if (!parser || parser->length < 8) {
        return 0;
    }
    int value = (int)read_le32(parser->buffer + 4);
    parser->buffer += 8;
    parser->length -= 8;
    return value;
}

short BeaconDataShort(bof_datap* parser) {
    if (!parser || parser->length < 6) {
        return 0;
    }
    short value = (short)read_le16(parser->buffer + 4);
    parser->buffer += 6;
    parser->length -= 6;
    return value;
}

int BeaconDataLength(bof_datap* parser) {
    if (!parser) {
        return 0;
    }
    return parser->length;
}

char* BeaconDataExtract(bof_datap* parser, int* size) {
    if (!parser || parser->length < 4) {
        if (size) {
            *size = 0;
        }
        return NULL;
    }

    uint32_t length = read_le32(parser->buffer);
    parser->buffer += 4;
    parser->length -= 4;
    if (length > (uint32_t)parser->length) {
        parser->length = 0;
        if (size) {
            *size = 0;
        }
        return NULL;
    }

    char* data = parser->buffer;
    parser->buffer += length;
    parser->length -= (int)length;
    if (size) {
        *size = (int)length;
    }
    return data;
}

void BeaconFormatAlloc(bof_formatp* format, int maxsz) {
    if (!format || maxsz <= 0) {
        return;
    }
    char* buf = (char*)calloc(1, (size_t)maxsz);
    if (!buf) {
        return;
    }
    format->original = buf;
    format->buffer = buf;
    format->length = 0;
    format->size = maxsz;
}

void BeaconFormatReset(bof_formatp* format) {
    if (!format || !format->original || format->size <= 0) {
        return;
    }
    memset(format->original, 0, (size_t)format->size);
    format->buffer = format->original;
    format->length = 0;
}

void BeaconFormatFree(bof_formatp* format) {
    if (!format) {
        return;
    }
    if (format->original) {
        free(format->original);
    }
    memset(format, 0, sizeof(*format));
}

void BeaconFormatAppend(bof_formatp* format, char* data, int len) {
    if (!format || !format->buffer || !data || len <= 0) {
        return;
    }
    if (format->length + len > format->size) {
        return;
    }
    memcpy(format->buffer, data, (size_t)len);
    format->buffer += len;
    format->length += len;
}

void BeaconFormatPrintf(bof_formatp* format, const char* fmt, ...) {
    if (!format || !format->buffer || !fmt || format->length >= format->size) {
        return;
    }
    int left = format->size - format->length;
    va_list ap;
    va_start(ap, fmt);
    int n = vsnprintf(format->buffer, (size_t)left, fmt, ap);
    va_end(ap);
    if (n <= 0) {
        return;
    }
    if (n >= left) {
        n = left - 1;
    }
    format->buffer += n;
    format->length += n;
}

char* BeaconFormatToString(bof_formatp* format, int* size) {
    if (!format) {
        if (size) {
            *size = 0;
        }
        return NULL;
    }
    if (size) {
        *size = format->length;
    }
    if (format->buffer && format->length < format->size) {
        *format->buffer = 0;
    }
    return format->original;
}

void BeaconFormatInt(bof_formatp* format, int value) {
    if (!format || !format->buffer || format->length + 4 > format->size) {
        return;
    }
    unsigned int v = (unsigned int)value;
    format->buffer[0] = (char)((v >> 24) & 0xff);
    format->buffer[1] = (char)((v >> 16) & 0xff);
    format->buffer[2] = (char)((v >> 8) & 0xff);
    format->buffer[3] = (char)(v & 0xff);
    format->buffer += 4;
    format->length += 4;
}

uintptr_t BeaconGetStopJobEvent(void) {
    return (uintptr_t)elfbofGetStopFD((uintptr_t)g_runtime_id);
}

int BeaconWakeup(void) {
    return 0;
}

int BeaconIsAdmin(void) {
    return geteuid() == 0 ? 1 : 0;
}

int BeaconAddValue(const char* key, void* ptr) {
    if (!key) {
        return 0;
    }
    pthread_mutex_lock(&g_values_mutex);
    bof_value_node* cur = g_values;
    while (cur) {
        if (strcmp(cur->key, key) == 0) {
            cur->value = ptr;
            pthread_mutex_unlock(&g_values_mutex);
            return 1;
        }
        cur = cur->next;
    }
    bof_value_node* node = (bof_value_node*)calloc(1, sizeof(*node));
    if (!node) {
        pthread_mutex_unlock(&g_values_mutex);
        return 0;
    }
    node->key = bof_strdup(key);
    if (!node->key) {
        free(node);
        pthread_mutex_unlock(&g_values_mutex);
        return 0;
    }
    node->value = ptr;
    node->next = g_values;
    g_values = node;
    pthread_mutex_unlock(&g_values_mutex);
    return 1;
}

void* BeaconGetValue(const char* key) {
    if (!key) {
        return NULL;
    }
    pthread_mutex_lock(&g_values_mutex);
    bof_value_node* cur = g_values;
    while (cur) {
        if (strcmp(cur->key, key) == 0) {
            void* val = cur->value;
            pthread_mutex_unlock(&g_values_mutex);
            return val;
        }
        cur = cur->next;
    }
    pthread_mutex_unlock(&g_values_mutex);
    return NULL;
}

int BeaconRemoveValue(const char* key) {
    if (!key) {
        return 0;
    }
    pthread_mutex_lock(&g_values_mutex);
    bof_value_node** pp = &g_values;
    while (*pp) {
        bof_value_node* cur = *pp;
        if (strcmp(cur->key, key) == 0) {
            *pp = cur->next;
            free(cur->key);
            free(cur);
            pthread_mutex_unlock(&g_values_mutex);
            return 1;
        }
        pp = &cur->next;
    }
    pthread_mutex_unlock(&g_values_mutex);
    return 0;
}

char** getEnviron(void) {
    return environ;
}

const char* getOSName(void) {
    return "linux";
}

void* elfbof_ptr_BeaconOutput(void) { return (void*)&BeaconOutput; }
void* elfbof_ptr_BeaconPrintf(void) { return (void*)&BeaconPrintf; }
void* elfbof_ptr_BeaconDataParse(void) { return (void*)&BeaconDataParse; }
void* elfbof_ptr_BeaconDataInt(void) { return (void*)&BeaconDataInt; }
void* elfbof_ptr_BeaconDataShort(void) { return (void*)&BeaconDataShort; }
void* elfbof_ptr_BeaconDataLength(void) { return (void*)&BeaconDataLength; }
void* elfbof_ptr_BeaconDataExtract(void) { return (void*)&BeaconDataExtract; }
void* elfbof_ptr_BeaconFormatAlloc(void) { return (void*)&BeaconFormatAlloc; }
void* elfbof_ptr_BeaconFormatReset(void) { return (void*)&BeaconFormatReset; }
void* elfbof_ptr_BeaconFormatFree(void) { return (void*)&BeaconFormatFree; }
void* elfbof_ptr_BeaconFormatAppend(void) { return (void*)&BeaconFormatAppend; }
void* elfbof_ptr_BeaconFormatPrintf(void) { return (void*)&BeaconFormatPrintf; }
void* elfbof_ptr_BeaconFormatToString(void) { return (void*)&BeaconFormatToString; }
void* elfbof_ptr_BeaconFormatInt(void) { return (void*)&BeaconFormatInt; }
void* elfbof_ptr_BeaconGetStopJobEvent(void) { return (void*)&BeaconGetStopJobEvent; }
void* elfbof_ptr_BeaconWakeup(void) { return (void*)&BeaconWakeup; }
void* elfbof_ptr_BeaconIsAdmin(void) { return (void*)&BeaconIsAdmin; }
void* elfbof_ptr_BeaconAddValue(void) { return (void*)&BeaconAddValue; }
void* elfbof_ptr_BeaconGetValue(void) { return (void*)&BeaconGetValue; }
void* elfbof_ptr_BeaconRemoveValue(void) { return (void*)&BeaconRemoveValue; }
void* elfbof_ptr_getEnviron(void) { return (void*)&getEnviron; }
void* elfbof_ptr_getOSName(void) { return (void*)&getOSName; }
