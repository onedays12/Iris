#ifndef ELF_BOF_BEACON_H
#define ELF_BOF_BEACON_H

#include <stddef.h>

#define CALLBACK_OUTPUT 0
#define CALLBACK_ERROR  13

typedef struct {
    char* original;
    char* buffer;
    int length;
    int size;
} datap;

typedef struct {
    char* original;
    char* buffer;
    int length;
    int size;
} formatp;

void BeaconOutput(int type, char* data, int len);
void BeaconPrintf(int type, const char* fmt, ...);

void BeaconDataParse(datap* parser, char* buffer, int size);
int BeaconDataInt(datap* parser);
short BeaconDataShort(datap* parser);
int BeaconDataLength(datap* parser);
char* BeaconDataExtract(datap* parser, int* size);

void BeaconFormatAlloc(formatp* format, int maxsz);
void BeaconFormatReset(formatp* format);
void BeaconFormatFree(formatp* format);
void BeaconFormatAppend(formatp* format, char* data, int len);
void BeaconFormatPrintf(formatp* format, const char* fmt, ...);
char* BeaconFormatToString(formatp* format, int* size);
void BeaconFormatInt(formatp* format, int value);

unsigned long BeaconGetStopJobEvent(void);
int BeaconWakeup(void);
int BeaconIsAdmin(void);
int BeaconAddValue(const char* key, void* ptr);
void* BeaconGetValue(const char* key);
int BeaconRemoveValue(const char* key);

char** getEnviron(void);
const char* getOSName(void);

#endif
