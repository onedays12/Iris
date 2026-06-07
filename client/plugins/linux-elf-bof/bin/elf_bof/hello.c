#include "beacon.h"

#include <stdio.h>
#include <string.h>

/*
 * hello - Minimal ELF BOF smoke test.
 * Exercises: .text, .rodata, BeaconPrintf, BeaconOutput, strlen.
 */
void go(char* args, int len)
{
    const char* msg = "hello from ELF BOF";
    datap parser;
    int value = 0;

    if (len >= 8) {
        BeaconDataParse(&parser, args, len);
        value = BeaconDataInt(&parser);
    }

    BeaconPrintf(CALLBACK_OUTPUT, "[hello] msg=%s len=%d value=%d strlen=%d\n",
                 msg, len, value, (int)strlen(msg));
}
