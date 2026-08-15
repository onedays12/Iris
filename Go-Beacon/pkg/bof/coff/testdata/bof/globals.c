#include "beacon.h"

#ifdef _MSC_VER
#define NOINLINE __declspec(noinline)
#else
#define NOINLINE __attribute__((noinline))
#endif

/* cross-section references exercise ADDR64/ADDR32NB/REL32 relocations */
static int static_g = 7;
static const char * pstr = "gstr";

NOINLINE int helper(int x) {
	return x * 2;
}

BOF_ENTRY(go) {
	BeaconPrintf(CALLBACK_OUTPUT, "static=%d pstr=%s\n", static_g, pstr);
	static_g += helper(21);
	BeaconPrintf(CALLBACK_OUTPUT, "static-after=%d\n", static_g);
}
