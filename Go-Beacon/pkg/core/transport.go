package core

// Transport 定义 Beacon 与上游之间的请求/响应交换接口。
// metadata 始终是加密后的 heartbeat，payload 为空时表示纯心跳，非空时表示结果回传。
type Transport interface {
	Exchange(metadata []byte, payload []byte) ([]byte, error)
}
