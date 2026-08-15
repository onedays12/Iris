/* ? dllimport???? beacon.h????? CS ?? BOF ???? */
void BeaconOutput(int type, char * data, int len);

__declspec(dllexport) void go(char * args, int len) {
	BeaconOutput(0, "nodll-output", 12);
}
