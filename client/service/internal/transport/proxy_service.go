// Package transport 提供前端 HTTP 代理与 WebSocket 转发服务。
//
// 抽成独立子包是因为 ProxyService 与 WebSocketService 共享 TLS 配置且语义同属
// "前后端通信桥接"层,与 plugin/file 业务逻辑解耦。
package transport

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"sync"
	"time"

	"irisclient/service/internal/tls"
)

/**
 * ProxyService
 * 职责：代理前端请求，绕开浏览器 CORS 限制与 TLS 证书验证
 */
type ProxyService struct {
	client *http.Client
}

// 共享 HTTP 客户端：所有 ProxyService 实例复用同一个 *http.Client，
// 复用 TCP 连接与 TLS 握手，避免高频请求时反复新建 transport。
//
// sync.Once 实现懒加载：首次调用时构造，之后并发安全地复用。
var (
	sharedHTTPClientOnce sync.Once
	sharedHTTPClient     *http.Client
)

// getSharedHTTPClient 返回进程级共享的 *http.Client。
// 复用同一个 transport 的连接池，避免 NewProxyService 每次调用都重建连接。
func getSharedHTTPClient() *http.Client {
	sharedHTTPClientOnce.Do(func() {
		transport := &http.Transport{
			TLSClientConfig:     tls.NewTLSConfig(),
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 10,
			IdleConnTimeout:     90 * time.Second,
		}
		sharedHTTPClient = &http.Client{
			Transport: transport,
			Timeout:   30 * time.Second,
		}
	})
	return sharedHTTPClient
}

// NewProxyService 构造一个复用共享 HTTP 客户端的 ProxyService 实例。
// 多次调用返回的实例共享底层连接池，不再为每条请求新建 transport。
func NewProxyService() *ProxyService {
	return &ProxyService{
		client: getSharedHTTPClient(),
	}
}

// SharedProxyService 返回进程级共享的 ProxyService 单例，
// 供后端内部 dispatch 路径直接复用，避免每次调用都构造新实例。
var (
	sharedProxyServiceOnce sync.Once
	sharedProxyServiceInst *ProxyService
)

func SharedProxyService() *ProxyService {
	sharedProxyServiceOnce.Do(func() {
		sharedProxyServiceInst = NewProxyService()
	})
	return sharedProxyServiceInst
}

func (p *ProxyService) UploadFileBase64(ctx context.Context, url string, fileName string, base64Data string, headersMap map[string]string) (string, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	part, err := writer.CreateFormFile("file", fileName)
	if err != nil {
		return "", fmt.Errorf("failed to create form file: %w", err)
	}

	decoder := base64.NewDecoder(base64.StdEncoding, bytes.NewBufferString(base64Data))
	if _, err := io.Copy(part, decoder); err != nil {
		return "", fmt.Errorf("failed to decode file data: %w", err)
	}

	if err := writer.Close(); err != nil {
		return "", fmt.Errorf("failed to close multipart writer: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, &body)
	if err != nil {
		return "", fmt.Errorf("failed to create upload request: %w", err)
	}

	for k, v := range headersMap {
		req.Header.Set(k, v)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := p.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("upload request to server failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, tooLarge, err := readBodyLimited(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read upload response body: %w", err)
	}
	if tooLarge {
		return "", fmt.Errorf("upload response body exceeds %d bytes limit", maxProxyResponseBody)
	}

	return string(respBody), nil
}

func (p *ProxyService) DownloadFileBase64(ctx context.Context, url string, headersMap map[string]string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create download request: %w", err)
	}

	for k, v := range headersMap {
		req.Header.Set(k, v)
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("download request to server failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, tooLarge, err := readBodyLimited(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read download response body: %w", err)
	}
	if tooLarge {
		return "", fmt.Errorf("download response body exceeds %d bytes limit", maxProxyResponseBody)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("download failed: %s", string(respBody))
	}

	return base64.StdEncoding.EncodeToString(respBody), nil
}
