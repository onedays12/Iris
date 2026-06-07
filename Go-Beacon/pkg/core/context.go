package core

import (
	"beacon/pkg/profile"
	"beacon/pkg/sysinfo"
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"io"
	"sync/atomic"
)

const sessionKeySize = 16 // 会话密钥长度（字节）

// Context 持有 Beacon 的运行时状态：系统元数据、标识、加密密钥和待发送队列。
type Context struct {
	Meta       *sysinfo.MetaData // 采集的系统信息（OS/Arch/User/IP 等）
	BeaconID   uint32            // 随机生成的 Beacon 唯一标识
	SessionKey []byte            // 16 字节随机会话密钥，用于 AES-GCM 加解密
	Outbox     Outbox            // 待发送结果包的线程安全队列
	active     atomic.Bool       // 生命周期标志，false 表示请求退出
}

// NewContext 初始化 Beacon 上下文：加载配置 → 采集系统信息 → 生成会话密钥。
func NewContext() (*Context, error) {
	// 加载嵌入的 TSCF v2 配置
	if err := profile.Load(); err != nil {
		return nil, err
	}

	// 生成 16 字节随机会话密钥
	sessionKey := make([]byte, sessionKeySize)
	if _, err := io.ReadFull(rand.Reader, sessionKey); err != nil {
		return nil, fmt.Errorf("generate session key: %w", err)
	}

	ctx := &Context{
		Meta:       sysinfo.GetMetaData(),
		BeaconID:   randomU32(),
		SessionKey: sessionKey,
	}

	ctx.Outbox.Init()
	ctx.active.Store(true)

	return ctx, nil
}

// Active 返回 Beacon 是否仍在运行（未被请求退出）。
func (ctx *Context) Active() bool {
	return ctx != nil && ctx.active.Load()
}

// Stop 请求 Beacon 退出主循环（不释放资源，由 Close 负责清理）。
func (ctx *Context) Stop() {
	if ctx != nil {
		ctx.active.Store(false)
	}
}

// Close 安全销毁上下文：清零会话密钥、释放 Outbox、标记为非活跃。
func (ctx *Context) Close() {
	if ctx == nil {
		return
	}
	for i := range ctx.SessionKey {
		ctx.SessionKey[i] = 0
	}
	ctx.Outbox.Free()
	ctx.active.Store(false)
}

// randomU32 生成一个随机 uint32（用于 BeaconID）。
func randomU32() uint32 {
	var b [4]byte
	if _, err := io.ReadFull(rand.Reader, b[:]); err != nil {
		return 0
	}
	return binary.BigEndian.Uint32(b[:])
}
