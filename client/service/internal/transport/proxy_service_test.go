package transport

import (
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// ─── DoRequest ───

func TestDoRequestReturnsBodyOnSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		_, _ = io.WriteString(w, `{"ok":true}`)
	}))
	defer srv.Close()

	p := NewProxyService()
	got, err := p.DoRequest(context.Background(), "GET", srv.URL, "", nil)
	if err != nil {
		t.Fatalf("DoRequest error: %v", err)
	}
	if got != `{"ok":true}` {
		t.Fatalf("DoRequest body = %q, want {\"ok\":true}", got)
	}
}

func TestDoRequestReturnsBodyOn401(t *testing.T) {
	// 设计:401 等业务错误由前端解析,DoRequest 始终返回 body 不报错
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
		_, _ = io.WriteString(w, `{"ok":false,"error":"unauthorized"}`)
	}))
	defer srv.Close()

	p := NewProxyService()
	got, err := p.DoRequest(context.Background(), "GET", srv.URL, "", nil)
	if err != nil {
		t.Fatalf("DoRequest should not error on 401, got %v", err)
	}
	if !strings.Contains(got, "unauthorized") {
		t.Fatalf("DoRequest should return 401 body, got %q", got)
	}
}

func TestDoRequestInjectsHeaders(t *testing.T) {
	var seenAuth, seenCT string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("Authorization")
		seenCT = r.Header.Get("Content-Type")
		w.WriteHeader(200)
	}))
	defer srv.Close()

	p := NewProxyService()
	_, err := p.DoRequest(context.Background(), "POST", srv.URL, `{"x":1}`, map[string]string{
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

func TestDoRequestPreservesCustomContentType(t *testing.T) {
	var seenCT string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenCT = r.Header.Get("Content-Type")
		w.WriteHeader(200)
	}))
	defer srv.Close()

	p := NewProxyService()
	_, err := p.DoRequest(context.Background(), "POST", srv.URL, `{"x":1}`, map[string]string{
		"Content-Type": "application/xml",
	})
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	if seenCT != "application/xml" {
		t.Errorf("Content-Type = %q, want application/xml (custom should not be overwritten)", seenCT)
	}
}

func TestDoRequestNetworkError(t *testing.T) {
	p := NewProxyService()
	_, err := p.DoRequest(context.Background(), "GET", "http://127.0.0.1:1/nonexistent", "", nil)
	if err == nil {
		t.Fatal("expected network error for unreachable host")
	}
	if !strings.Contains(err.Error(), "request to server failed") {
		t.Fatalf("expected 'request to server failed' in error, got %v", err)
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
