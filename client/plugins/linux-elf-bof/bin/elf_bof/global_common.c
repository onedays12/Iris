#include "beacon.h"

#include <stdio.h>
#include <string.h>

/*
 * global_common - Tests COMMON symbol handling and .data/.bss globals.
 *
 * Without -fno-common, uninitialized globals at file scope may be
 * emitted as SHN_COMMON symbols. This BOF verifies the loader
 * handles them correctly.
 *
 * Compile with: gcc -c -fPIC ... global_common.c (default, no -fno-common)
 * Compile with: gcc -c -fPIC -fno-common ... global_common.c (BSS instead)
 *
 * Both paths should work.
 */

/* COMMON symbol (no initializer, not static) */
int common_int;
char common_buf[256];

/* Explicit BSS (static, no initializer) */
static int bss_counter;

/* Explicit .data (initialized) */
static int data_value = 42;

/* .rodata */
static const char* ro_label = "global-common-test";

void go(char* args, int len)
{
    datap parser;
    int arg_val = 0;

    (void)args;
    (void)len;

    if (len >= 8) {
        BeaconDataParse(&parser, args, len);
        arg_val = BeaconDataInt(&parser);
    }

    /* Write to COMMON/BSS globals */
    common_int = arg_val + data_value + bss_counter;
    bss_counter++;
    snprintf(common_buf, sizeof(common_buf), "common_int=%d bss_counter=%d data_value=%d",
             common_int, bss_counter, data_value);

    BeaconPrintf(CALLBACK_OUTPUT, "[%s] %s\n", ro_label, common_buf);
    BeaconPrintf(CALLBACK_OUTPUT, "[%s] common_int_addr=%p bss_counter_addr=%p data_value_addr=%p\n",
                 ro_label, &common_int, &bss_counter, &data_value);
}
