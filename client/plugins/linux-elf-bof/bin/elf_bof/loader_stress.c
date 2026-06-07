#include "beacon.h"

#include <stdint.h>
#include <stdio.h>
#include <string.h>

static const char ro_banner[] = "elf-bof-loader-stress";
static int g_data_counter = 7;
static char g_bss_text[128];
static int g_bss_counter;

static int local_mix(int value)
{
    return value * 3 + g_data_counter + g_bss_counter;
}

static void copy_arg_text(char* dst, int dst_size, const char* src, int src_len)
{
    int n;

    if (!dst || dst_size <= 0) {
        return;
    }

    dst[0] = 0;
    if (!src || src_len <= 0) {
        return;
    }

    n = src_len;
    if (n > dst_size - 1) {
        n = dst_size - 1;
    }

    snprintf(dst, (size_t)dst_size, "%.*s", n, src);
}

void go(char* args, int len)
{
    datap parser;
    formatp fmt;
    int arg_int;
    short arg_short;
    int arg_text_len;
    char* arg_text;
    int mixed;
    int formatted_len;
    char* formatted;
    unsigned long stop_fd;
    int is_admin;
    char** env;
    int env_present;
    void* stored;

    BeaconPrintf(CALLBACK_OUTPUT, "[elf-test] start banner=%s len=%d\n", ro_banner, len);

    g_bss_counter++;

    BeaconDataParse(&parser, args, len);
    arg_int = BeaconDataInt(&parser);
    arg_short = BeaconDataShort(&parser);
    arg_text = BeaconDataExtract(&parser, &arg_text_len);

    copy_arg_text(g_bss_text, sizeof(g_bss_text), arg_text, arg_text_len);
    mixed = local_mix(arg_int);
    stop_fd = BeaconGetStopJobEvent();
    is_admin = BeaconIsAdmin();
    env = getEnviron();
    env_present = (env && env[0]) ? 1 : 0;

    BeaconPrintf(CALLBACK_OUTPUT,
                 "[elf-test] parsed int=%d short=%d text_len=%d text='%s'\n",
                 arg_int,
                 (int)arg_short,
                 arg_text_len,
                 g_bss_text);

    BeaconPrintf(CALLBACK_OUTPUT,
                 "[elf-test] globals data=%d bss=%d mixed=%d strlen=%d stop_fd=%lu admin=%d os=%s env=%d\n",
                 g_data_counter,
                 g_bss_counter,
                 mixed,
                 (int)strlen(g_bss_text),
                 stop_fd,
                 is_admin,
                 getOSName(),
                 env_present);

    BeaconFormatAlloc(&fmt, 512);
    BeaconFormatPrintf(&fmt,
                       "[elf-test] format api ok: int=%d short=%d text=%s mixed=%d\n",
                       arg_int,
                       (int)arg_short,
                       g_bss_text,
                       mixed);
    formatted = BeaconFormatToString(&fmt, &formatted_len);
    BeaconOutput(CALLBACK_OUTPUT, formatted, formatted_len);
    BeaconFormatFree(&fmt);

    BeaconAddValue("elf-test-value", &g_data_counter);
    stored = BeaconGetValue("elf-test-value");
    BeaconPrintf(CALLBACK_OUTPUT,
                 "[elf-test] value api stored=%p expected=%p remove=%d\n",
                 stored,
                 &g_data_counter,
                 BeaconRemoveValue("elf-test-value"));

    BeaconPrintf(CALLBACK_OUTPUT, "[elf-test] done\n");
}
