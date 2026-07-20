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

// Deprecated: 使用 DoRequestWithStatus 替代。
// DoRequest 吞掉 HTTP 状态码,无法区分 401/5xx/网络失败,仅返回纯 body 字符串。
// dispatch 路径已改用 DoRequestWithStatus;此方法保留仅为向后兼容,
// 前端 httpClient.js 实际不再调用。新代码请勿使用,后续版本可能移除。
/**
 * DoRequest 执行转发请求
 * @param method HTTP 方法 (GET, POST, etc.)
 * @param url 完整的请求地址
 * @param payload JSON 报文体
 * @param headersMap 头信息映射
 */
func (p *ProxyService) DoRequest(ctx context.Context, method string, url string, payload string, headersMap map[string]string) (string, error) {
	var bodyReader io.Reader
	if payload != "" {
		bodyReader = bytes.NewBufferString(payload)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %v", err)
	}

	// 注入头信息
	for k, v := range headersMap {
		req.Header.Set(k, v)
	}

	// 强制设置 JSON 类型，除非已有指定
	if req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("request to server failed: %v", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response body: %v", err)
	}

	// 始终返回 Body，业务错误 (如 401) 由前端根据 OK 字段解析
	return string(respBody), nil
}

func (p *ProxyService) UploadFileBase64(ctx context.Context, url string, fileName string, base64Data string, headersMap map[string]string) (string, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	part, err := writer.CreateFormFile("file", fileName)
	if err != nil {
		return "", fmt.Errorf("failed to create form file: %v", err)
	}

	decoder := base64.NewDecoder(base64.StdEncoding, bytes.NewBufferString(base64Data))
	if _, err := io.Copy(part, decoder); err != nil {
		return "", fmt.Errorf("failed to decode file data: %v", err)
	}

	if err := writer.Close(); err != nil {
		return "", fmt.Errorf("failed to close multipart writer: %v", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, &body)
	if err != nil {
		return "", fmt.Errorf("failed to create upload request: %v", err)
	}

	for k, v := range headersMap {
		req.Header.Set(k, v)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := p.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("upload request to server failed: %v", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read upload response body: %v", err)
	}

	return string(respBody), nil
}

func (p *ProxyService) DownloadFileBase64(ctx context.Context, url string, headersMap map[string]string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create download request: %v", err)
	}

	for k, v := range headersMap {
		req.Header.Set(k, v)
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("download request to server failed: %v", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read download response body: %v", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("download failed: %s", string(respBody))
	}

	return base64.StdEncoding.EncodeToString(respBody), nil
}
