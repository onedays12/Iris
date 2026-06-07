package command

import (
	"beacon/pkg/jobs"
	"fmt"
	"sort"
	"time"
)

func TunnelJobRows() []jobs.Row {
	now := time.Now()
	rows := make([]jobs.Row, 0)

	tunnelRuntime.mu.RLock()
	for _, ch := range tunnelRuntime.channels {
		if ch.OriginalTaskID == 0 {
			continue
		}
		age := int64(now.Sub(ch.CreatedAt).Seconds())
		if age < 0 {
			age = 0
		}
		rows = append(rows, jobs.Row{
			ID:        ch.OriginalTaskID,
			Type:      "tunnel",
			State:     "running",
			Age:       age,
			CommandID: CommandTunnelStart,
			Name:      "tunnel",
			Ref:       fmt.Sprintf("%s/%s", ch.TunnelID, ch.ChannelID),
			Detail:    ch.TargetAddress,
		})
	}
	tunnelRuntime.mu.RUnlock()

	sort.Slice(rows, func(i, j int) bool { return rows[i].ID < rows[j].ID })
	return rows
}

func CancelTunnelJob(jobID uint32) (string, bool) {
	if jobID == 0 {
		return "", false
	}

	tunnelRuntime.mu.RLock()
	var target *TunnelChannel
	for _, ch := range tunnelRuntime.channels {
		if ch.OriginalTaskID == jobID {
			target = ch
			break
		}
	}
	tunnelRuntime.mu.RUnlock()

	if target == nil {
		return "", false
	}

	target.Close()
	tunnelRuntime.Remove(target.TunnelID, target.ChannelID)
	sendControlPacket(target.TunnelID, target.ChannelID, "close", TunnelReasonCanceled, nil)
	return fmt.Sprintf("tunnel job %d canceled", jobID), true
}
