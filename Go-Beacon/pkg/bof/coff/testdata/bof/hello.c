#include "beacon.h"
#include <string.h>

BOF_ENTRY(go) {
	BeaconOutput(CALLBACK_OUTPUT, "hello-beacon", 12);
	BeaconPrintf(CALLBACK_OUTPUT, "printf-int=%d str=%s\n", 42, "msg");
}
