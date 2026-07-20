package command

import (
	"beacon/pkg/jobs"
	"fmt"
	"sort"
	"time"
)

func TunnelJobRows(runtime *TunnelRuntime) []jobs.Row {
	if runtime == nil {
		return nil
	}
	now := time.Now()
	rows := make([]jobs.Row, 0)

	runtime.mu.RLock()
	for _, ch := range runtime.channels {
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
	runtime.mu.RUnlock()

	sort.Slice(rows, func(i, j int) bool { return rows[i].ID < rows[j].ID })
	return rows
}

func CancelTunnelJob(runtime *TunnelRuntime, jobID uint32) (string, bool) {
	if runtime == nil || jobID == 0 {
		return "", false
	}

	runtime.mu.RLock()
	var target *TunnelChannel
	for _, ch := range runtime.channels {
		if ch.OriginalTaskID == jobID {
			target = ch
			break
		}
	}
	runtime.mu.RUnlock()

	if target == nil {
		return "", false
	}

	target.Close()
	runtime.Remove(target.TunnelID, target.ChannelID)
	sendControlPacket(runtime, target.TunnelID, target.ChannelID, "close", TunnelReasonCanceled, nil)
	return fmt.Sprintf("tunnel job %d canceled", jobID), true
}
