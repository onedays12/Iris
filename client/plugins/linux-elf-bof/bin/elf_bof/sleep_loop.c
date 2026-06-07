#include "beacon.h"

#include <stdint.h>
#include <stdio.h>
#include <poll.h>
#include <unistd.h>

/*
 * sleep_loop - Tests killjob / eventfd cooperative cancellation.
 *
 * BeaconGetStopJobEvent() returns an eventfd (Linux) that becomes
 * readable when the operator issues a "killjob" command.
 *
 * This BOF polls the fd in a loop. When the fd fires, it exits cleanly.
 */
void go(char* args, int len)
{
    unsigned long stop_fd;
    struct pollfd pfd;
    int tick = 0;
    int timeout_ms = 500;
    int max_ticks = 1200; /* ~10 minutes max */

    (void)args;
    (void)len;

    stop_fd = BeaconGetStopJobEvent();
    BeaconPrintf(CALLBACK_OUTPUT, "[sleep-loop] started, stop_fd=%lu\n", stop_fd);

    if (stop_fd == 0) {
        BeaconPrintf(CALLBACK_ERROR, "[sleep-loop] BeaconGetStopJobEvent returned 0, cannot monitor stop signal\n");
        return;
    }

    pfd.fd = (int)stop_fd;
    pfd.events = POLLIN;
    pfd.revents = 0;

    while (tick < max_ticks) {
        int ret = poll(&pfd, 1, timeout_ms);
        if (ret < 0) {
            BeaconPrintf(CALLBACK_ERROR, "[sleep-loop] poll error\n");
            return;
        }
        if (ret > 0 && (pfd.revents & POLLIN)) {
            BeaconPrintf(CALLBACK_OUTPUT, "[sleep-loop] stop signal received after %d ticks, exiting\n", tick);
            return;
        }
        tick++;
        if (tick % 10 == 0) {
            BeaconPrintf(CALLBACK_OUTPUT, "[sleep-loop] tick %d\n", tick);
        }
    }

    BeaconPrintf(CALLBACK_OUTPUT, "[sleep-loop] max ticks reached, exiting\n");
}
