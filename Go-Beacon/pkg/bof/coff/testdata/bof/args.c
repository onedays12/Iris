#include "beacon.h"
#include <string.h>

BOF_ENTRY(go) {
	datap parser;
	BeaconDataParse(&parser, args, len);
	int a = BeaconDataInt(&parser);
	short b = BeaconDataShort(&parser);
	int remaining = BeaconDataLength(&parser);
	int sz = 0;
	char * data = BeaconDataExtract(&parser, &sz);

	BeaconPrintf(CALLBACK_OUTPUT, "int=%d short=%d rem=%d blen=%d data=%s\n",
		a, b, remaining, sz, data ? data : "null");
}
