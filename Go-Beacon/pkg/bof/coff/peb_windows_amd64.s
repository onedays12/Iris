#include "textflag.h"

TEXT ·currentPEB(SB),NOSPLIT,$0-8
	MOVQ 0x60(GS), AX
	MOVQ AX, ret+0(FP)
	RET
