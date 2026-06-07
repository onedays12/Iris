package command

import "beacon/pkg/utils/packet"

func emitBOFOutput(sink func([]byte), taskID uint32, commandID uint32, payload []byte) {
	if sink != nil {
		sink(packet.MakeFinalPacket(taskID, commandID, payload))
	}
}
