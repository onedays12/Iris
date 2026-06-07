// Package crypt 实现 Beacon 的加密通信协议。
// 使用 AES-256-GCM 认证加密，密钥通过 HMAC-SHA256 类 HKDF 方案派生。
// 两级密钥体系：Bootstrap Keys（由配置中的 root key 派生）和 Session Keys（由心跳携带的会话密钥派生）。
package crypt

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"strings"
)

// 信封和密钥常量
const (
	EnvelopeVersion   byte = 1 // 加密信封版本号
	KeySize                = 32 // AES-256 密钥长度（字节）
	MinSessionKeySize      = 16 // 会话密钥最小长度
)

// 密钥用途标识（用于派生不同用途的子密钥）
const (
	KeyPurposeConfig    = "teamserver/config/v1"    // 配置加密
	KeyPurposeHeartbeat = "teamserver/heartbeat/v1" // 心跳加密
	KeyPurposeTask      = "teamserver/task/v1"      // 任务下发加密
	KeyPurposeResult    = "teamserver/result/v1"    // 结果回传加密
)

// BootstrapKeys 由监听器配置中的 encrypt_key 派生而来。
// server 用 ConfigKey 加密 Beacon 配置、用 HeartbeatKey 解密 Beacon 心跳包。
type BootstrapKeys struct {
	ConfigKey    []byte
	HeartbeatKey []byte
}

// SessionKeys 由心跳包携带的 session key 派生而来。
// server 用 TaskKey 加密下发任务、用 ResultKey 解密 Beacon 回传结果。
type SessionKeys struct {
	TaskKey   []byte
	ResultKey []byte
}

// NewBootstrapKeys 从配置中的 root key 派生出 Bootstrap 密钥对。
func NewBootstrapKeys(rootKey string) (BootstrapKeys, error) {
	rootKey = strings.TrimSpace(rootKey)
	if rootKey == "" {
		return BootstrapKeys{}, errors.New("bootstrap key is required")
	}

	root := []byte(rootKey)
	return BootstrapKeys{
		ConfigKey:    deriveKey(root, KeyPurposeConfig),
		HeartbeatKey: deriveKey(root, KeyPurposeHeartbeat),
	}, nil
}

// NewSessionKeys 从心跳包携带的会话密钥派生出 Session 密钥对。
func NewSessionKeys(sessionKey []byte) (SessionKeys, error) {
	if len(sessionKey) < MinSessionKeySize {
		return SessionKeys{}, fmt.Errorf("session key must be at least %d bytes", MinSessionKeySize)
	}

	return SessionKeys{
		TaskKey:   deriveKey(sessionKey, KeyPurposeTask),
		ResultKey: deriveKey(sessionKey, KeyPurposeResult),
	}, nil
}

// EncryptConfig 用 Bootstrap 密钥加密 Beacon 配置。
func EncryptConfig(rootKey string, plaintext []byte) ([]byte, error) {
	keys, err := NewBootstrapKeys(rootKey)
	if err != nil {
		return nil, err
	}
	return sealAEAD(keys.ConfigKey, plaintext, []byte(KeyPurposeConfig))
}

// DecryptConfig 用 Bootstrap 密钥解密 Beacon 配置。
func DecryptConfig(rootKey string, envelope []byte) ([]byte, error) {
	keys, err := NewBootstrapKeys(rootKey)
	if err != nil {
		return nil, err
	}
	return openAEAD(keys.ConfigKey, envelope, []byte(KeyPurposeConfig))
}

// EncryptHeartbeat 用 Bootstrap 密钥加密心跳包。
func EncryptHeartbeat(rootKey string, plaintext []byte) ([]byte, error) {
	keys, err := NewBootstrapKeys(rootKey)
	if err != nil {
		return nil, err
	}
	return sealAEAD(keys.HeartbeatKey, plaintext, []byte(KeyPurposeHeartbeat))
}

// DecryptHeartbeat 用 Bootstrap 密钥解密心跳包。
func DecryptHeartbeat(rootKey string, envelope []byte) ([]byte, error) {
	keys, err := NewBootstrapKeys(rootKey)
	if err != nil {
		return nil, err
	}
	return openAEAD(keys.HeartbeatKey, envelope, []byte(KeyPurposeHeartbeat))
}

// EncryptTask 用 Session 密钥加密服务端下发的任务。
func EncryptTask(sessionKey []byte, plaintext []byte) ([]byte, error) {
	keys, err := NewSessionKeys(sessionKey)
	if err != nil {
		return nil, err
	}
	return sealAEAD(keys.TaskKey, plaintext, []byte(KeyPurposeTask))
}

// DecryptTask 用 Session 密钥解密服务端下发的任务。
func DecryptTask(sessionKey []byte, envelope []byte) ([]byte, error) {
	keys, err := NewSessionKeys(sessionKey)
	if err != nil {
		return nil, err
	}
	return openAEAD(keys.TaskKey, envelope, []byte(KeyPurposeTask))
}

// EncryptResult 用 Session 密钥加密 Beacon 回传的结果。
func EncryptResult(sessionKey []byte, plaintext []byte) ([]byte, error) {
	keys, err := NewSessionKeys(sessionKey)
	if err != nil {
		return nil, err
	}
	return sealAEAD(keys.ResultKey, plaintext, []byte(KeyPurposeResult))
}

// DecryptResult 用 Session 密钥解密 Beacon 回传的结果。
func DecryptResult(sessionKey []byte, envelope []byte) ([]byte, error) {
	keys, err := NewSessionKeys(sessionKey)
	if err != nil {
		return nil, err
	}
	return openAEAD(keys.ResultKey, envelope, []byte(KeyPurposeResult))
}

// deriveKey 使用类 HKDF 方案从 secret 派生指定用途的 32 字节密钥。
// 步骤：HMAC-SHA256 提取（固定 salt "TeamServer key schedule v1"）→ HMAC-SHA256 扩展（purpose + counter）。
func deriveKey(secret []byte, purpose string) []byte {
	// 提取阶段：用固定 salt 对 secret 做 HMAC，得到伪随机密钥 PRK
	prk := hmacSHA256([]byte("TeamServer key schedule v1"), secret)

	// 扩展阶段：迭代 HMAC 直到产出足够长度
	var out []byte
	var previous []byte
	for counter := byte(1); len(out) < KeySize; counter++ {
		mac := hmac.New(sha256.New, prk)
		mac.Write(previous)           // T(N-1)
		mac.Write([]byte(purpose))    // 用途标识
		mac.Write([]byte{counter})    // 计数器
		previous = mac.Sum(nil)
		out = append(out, previous...)
	}

	return out[:KeySize]
}

func hmacSHA256(key []byte, data []byte) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write(data)
	return mac.Sum(nil)
}

// sealAEAD 使用 AES-256-GCM 加密并返回信封格式：[版本 1B][随机 nonce][密文+tag]。
// additionalData 作为 AAD 绑定到密文，防止跨用途重放。
func sealAEAD(key []byte, plaintext []byte, additionalData []byte) ([]byte, error) {
	aead, err := newAESGCM(key)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("generate nonce: %w", err)
	}

	envelope := make([]byte, 0, 1+len(nonce)+len(plaintext)+aead.Overhead())
	envelope = append(envelope, EnvelopeVersion)
	envelope = append(envelope, nonce...)
	envelope = aead.Seal(envelope, nonce, plaintext, additionalData)
	return envelope, nil
}

// openAEAD 解密信封格式的密文：验证版本 → 提取 nonce → AES-256-GCM 解密。
func openAEAD(key []byte, envelope []byte, additionalData []byte) ([]byte, error) {
	aead, err := newAESGCM(key)
	if err != nil {
		return nil, err
	}
	if len(envelope) < 1+aead.NonceSize()+aead.Overhead() {
		return nil, errors.New("encrypted envelope is too short")
	}
	if envelope[0] != EnvelopeVersion {
		return nil, fmt.Errorf("unsupported encrypted envelope version: %d", envelope[0])
	}

	nonceStart := 1
	nonceEnd := nonceStart + aead.NonceSize()
	nonce := envelope[nonceStart:nonceEnd]
	ciphertext := envelope[nonceEnd:]
	return aead.Open(nil, nonce, ciphertext, additionalData)
}

func newAESGCM(key []byte) (cipher.AEAD, error) {
	if len(key) != KeySize {
		return nil, fmt.Errorf("aead key must be %d bytes", KeySize)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
