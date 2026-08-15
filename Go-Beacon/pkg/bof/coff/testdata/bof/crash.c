#include "beacon.h"
#include <stdint.h>

BOF_ENTRY(go) {
	BeaconOutput(CALLBACK_OUTPUT, "before-crash", 12);
	volatile uintptr_t * p = (volatile uintptr_t *)0x0;
	*p = 0xdeadbeef;   // 触发访问冲突，VEH 应捕获
	BeaconOutput(CALLBACK_OUTPUT, "after-crash", 11);
}
