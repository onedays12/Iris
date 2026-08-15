#include "beacon.h"

BOF_ENTRY(go) {
	void * ev = BeaconGetStopJobEvent();
	BeaconPrintf(CALLBACK_OUTPUT, "stop-event=%p\n", ev);
}
