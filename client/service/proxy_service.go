package service

import (
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"time"
)

/**
 * ProxyService
 * 职责：代理前端请求，绕开浏览器 CORS 限制与 TLS 证书验证
 */
type ProxyService struct {
	client *http.Client
}

func NewProxyService() *ProxyService {
	// 创建忽略证书校验的 HTTP 客户端
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}
	return &ProxyService{
		client: &http.Client{
			Transport: tr,
			Timeout:   30 * time.Second,
		},
	}
}

/**
 * DoRequest 执行转发请求
 * @param method HTTP 方法 (GET, POST, etc.)
 * @param url 完整的请求地址
 * @param payload JSON 报文体
 * @param headersMap 头信息映射
 */
func (p *ProxyService) DoRequest(method string, url string, payload string, headersMap map[string]string) (string, error) {
	var bodyReader io.Reader
	if payload != "" {
		bodyReader = bytes.NewBufferString(payload)
	}

	req, err := http.NewRequest(method, url, bodyReader)
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

func (p *ProxyService) UploadFileBase64(url string, fileName string, base64Data string, headersMap map[string]string) (string, error) {
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

	req, err := http.NewRequest("POST", url, &body)
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

func (p *ProxyService) DownloadFileBase64(url string, headersMap map[string]string) (string, error) {
	req, err := http.NewRequest("GET", url, nil)
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
