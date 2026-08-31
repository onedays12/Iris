package transport

// NewFanoutEmitter 把一条事件广播给多个出口(Wails 前端 + MCP EventSink 等)。
// 任一出口的 panic 被隔离,不影响其余出口与调用方;出口顺序即注入顺序。
func NewFanoutEmitter(emitters ...EventEmitter) EventEmitter {
	return fanoutEmitter{emitters: emitters}
}

type fanoutEmitter struct {
	emitters []EventEmitter
}

func (f fanoutEmitter) Emit(name string, data ...any) {
	for _, e := range f.emitters {
		if e == nil {
			continue
		}
		func() {
			defer func() { _ = recover() }() // 单出口故障不拖垮整条链
			e.Emit(name, data...)
		}()
	}
}
