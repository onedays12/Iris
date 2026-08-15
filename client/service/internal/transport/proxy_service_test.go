package transport

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// withSmallResponseLimit 临时调小响应体上限, 验证超限路径后由 t.Cleanup 还原。
func withSmallResponseLimit(t *testing.T, limit int64) {
	t.Helper()
	original := maxProxyResponseBody
	maxProxyResponseBody = limit
	t.Cleanup(func() { maxProxyResponseBody = original })
}

// ─── 响应体大小上限 ───

func TestDoRequestWithStatusRejectsOversizedBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		_, _ = w.Write([]byte(strings.Repeat("x", 2048)))
	}))
	defer srv.Close()

	withSmallResponseLimit(t, 1024)

	p := NewProxyService()
	got, err := p.DoRequestWithStatus(context.Background(), "GET", srv.URL, "", nil)
	if err != nil {
		t.Fatalf("DoRequestWithStatus should encode oversize into ProxyResult, got %v", err)
	}

	var result ProxyResult
	if err := json.Unmarshal([]byte(got), &result); err != nil {
		t.Fatalf("failed to parse result: %v", err)
	}
	if result.Status != 200 {
		t.Errorf("status = %d, want 200 (preserved)", result.Status)
	}
	if !strings.Contains(result.Error, "exceeds") {
		t.Errorf("error should mention size limit, got %q", result.Error)
	}
	if result.Body != "" {
		t.Errorf("body should be empty on oversize, got %d bytes", len(result.Body))
	}
}

func TestUploadFileBase64RejectsOversizedBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		_, _ = w.Write([]byte(strings.Repeat("y", 2048)))
	}))
	defer srv.Close()

	withSmallResponseLimit(t, 1024)

	p := NewProxyService()
	_, err := p.UploadFileBase64(context.Background(), srv.URL, "f.txt", base64.StdEncoding.EncodeToString([]byte("tiny")), nil)
	if err == nil {
		t.Fatal("expected error for oversized upload response")
	}
	if !strings.Contains(err.Error(), "exceeds") {
		t.Fatalf("expected size limit error, got %v", err)
	}
}

func TestDownloadFileBase64RejectsOversizedBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		_, _ = w.Write([]byte(strings.Repeat("z", 2048)))
	}))
	defer srv.Close()

	withSmallResponseLimit(t, 1024)

	p := NewProxyService()
	_, err := p.DownloadFileBase64(context.Background(), srv.URL, nil)
	if err == nil {
		t.Fatal("expected error for oversized download response")
	}
	if !strings.Contains(err.Error(), "exceeds") {
		t.Fatalf("expected size limit error, got %v", err)
	}
}

// ─── DoRequestWithStatus: Content-Type 注入语义（其余语义见 proxy_structured_test.go）───

func TestDoRequestWithStatusDefaultsContentType(t *testing.T) {
	var seenAuth, seenCT string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("Authorization")
		seenCT = r.Header.Get("Content-Type")
		w.WriteHeader(200)
	}))
	defer srv.Close()

	p := NewProxyService()
	_, err := p.DoRequestWithStatus(context.Background(), "POST", srv.URL, `{"x":1}`, map[string]string{
		"Authorization": "Bearer tok",
	})
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	if seenAuth != "Bearer tok" {
		t.Errorf("Authorization header = %q, want Bearer tok", seenAuth)
	}
	// 未显式设 Content-Type 时应默认 application/json
	if seenCT != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", seenCT)
	}
}

func TestDoRequestWithStatusPreservesCustomContentType(t *testing.T) {
	var seenCT string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenCT = r.Header.Get("Content-Type")
		w.WriteHeader(200)
	}))
	defer srv.Close()

	p := NewProxyService()
	_, err := p.DoRequestWithStatus(context.Background(), "POST", srv.URL, `{"x":1}`, map[string]string{
		"Content-Type": "application/xml",
	})
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	if seenCT != "application/xml" {
		t.Errorf("Content-Type = %q, want application/xml (custom should not be overwritten)", seenCT)
	}
}

// ─── UploadFileBase64 ───

func TestUploadFileBase64RoundTrip(t *testing.T) {
	// server 端解析 multipart,还原文件名+内容
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			w.WriteHeader(400)
			_, _ = io.WriteString(w, err.Error())
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			w.WriteHeader(400)
			_, _ = io.WriteString(w, err.Error())
			return
		}
		defer file.Close()
		body, _ := io.ReadAll(file)
		w.WriteHeader(200)
		_, _ = io.WriteString(w, header.Filename+":"+string(body))
	}))
	defer srv.Close()

	content := []byte("hello-file-content")
	b64 := base64.StdEncoding.EncodeToString(content)

	p := NewProxyService()
	got, err := p.UploadFileBase64(context.Background(), srv.URL, "test.bin", b64, nil)
	if err != nil {
		t.Fatalf("UploadFileBase64 error: %v", err)
	}
	want := "test.bin:hello-file-content"
	if got != want {
		t.Fatalf("UploadFileBase64 response = %q, want %q", got, want)
	}
}

func TestUploadFileBase64RejectsInvalidBase64(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	}))
	defer srv.Close()

	p := NewProxyService()
	_, err := p.UploadFileBase64(context.Background(), srv.URL, "f.txt", "!!!not-base64!!!", nil)
	if err == nil {
		t.Fatal("expected error for invalid base64")
	}
	if !strings.Contains(err.Error(), "decode file data") {
		t.Fatalf("expected decode error, got %v", err)
	}
}

// ─── DownloadFileBase64 ───

func TestDownloadFileBase64ReturnsEncoded(t *testing.T) {
	content := []byte("binary-data-123")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		_, _ = w.Write(content)
	}))
	defer srv.Close()

	p := NewProxyService()
	got, err := p.DownloadFileBase64(context.Background(), srv.URL, nil)
	if err != nil {
		t.Fatalf("DownloadFileBase64 error: %v", err)
	}
	decoded, err := base64.StdEncoding.DecodeString(got)
	if err != nil {
		t.Fatalf("returned data is not valid base64: %v", err)
	}
	if string(decoded) != string(content) {
		t.Fatalf("decoded = %q, want %q", decoded, content)
	}
}

func TestDownloadFileBase64RejectsNon2xx(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
		_, _ = io.WriteString(w, "internal error")
	}))
	defer srv.Close()

	p := NewProxyService()
	_, err := p.DownloadFileBase64(context.Background(), srv.URL, nil)
	if err == nil {
		t.Fatal("expected error for non-2xx")
	}
	if !strings.Contains(err.Error(), "download failed") {
		t.Fatalf("expected 'download failed' error, got %v", err)
	}
}

func TestDownloadFileBase64InjectsAuthHeader(t *testing.T) {
	var seenAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("Authorization")
		w.WriteHeader(200)
		_, _ = w.Write([]byte("x"))
	}))
	defer srv.Close()

	p := NewProxyService()
	_, err := p.DownloadFileBase64(context.Background(), srv.URL, map[string]string{"Authorization": "Bearer dl-token"})
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	if seenAuth != "Bearer dl-token" {
		t.Errorf("Authorization = %q, want Bearer dl-token", seenAuth)
	}
}
