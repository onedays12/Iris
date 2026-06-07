package command

import (
	"beacon/pkg/utils/packet"
)

func Whoami(p *packet.Parser) ([]byte, error) {
	result, err := whoamiLogic()
	if err != nil {
		return nil, err
	}
	return packet.PackArray([]any{[]byte(result)})
}
