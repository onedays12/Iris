#ifndef BEACON_BOF_TEST_H
#define BEACON_BOF_TEST_H

typedef struct {
	char * original;
	char * buffer;
	int    length;
	int    size;
} datap;

typedef struct {
	char * original;
	char * buffer;
	int    length;
	int    size;
} formatp;

#define CALLBACK_OUTPUT			0x0
#define CALLBACK_ERROR			0x1

#define BOF_ENTRY(entry)	__declspec(dllexport) void entry(char * args, int len)

/* dllimport generates __imp_ symbols that the loader resolves via its GOT path */
__declspec(dllimport) void BeaconPrintf(int type, char * fmt, ...);
__declspec(dllimport) void BeaconOutput(int type, char * data, int len);

__declspec(dllimport) void BeaconDataParse(datap * parser, char * buffer, int size);
__declspec(dllimport) int  BeaconDataInt(datap * parser);
__declspec(dllimport) short BeaconDataShort(datap * parser);
__declspec(dllimport) int  BeaconDataLength(datap * parser);
__declspec(dllimport) char* BeaconDataExtract(datap * parser, int * size);

__declspec(dllimport) void BeaconFormatAlloc(formatp * format, int maxsz);
__declspec(dllimport) void BeaconFormatReset(formatp * format);
__declspec(dllimport) void BeaconFormatAppend(formatp * format, char * text, int len);
__declspec(dllimport) void BeaconFormatPrintf(formatp * format, char * fmt, ...);
__declspec(dllimport) void BeaconFormatToString(formatp * format, char ** str, int * size);
__declspec(dllimport) void BeaconFormatFree(formatp * format);

__declspec(dllimport) void * BeaconGetStopJobEvent(void);

#endif
