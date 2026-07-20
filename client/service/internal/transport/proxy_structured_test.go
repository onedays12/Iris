package transport

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDoRequestWithStatusReturns200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		_, _ = io.WriteString(w, `{"ok":true}`)
	}))
	defer srv.Close()

	p := NewProxyService()
	got, err := p.DoRequestWithStatus(context.Background(), "GET", srv.URL, "", nil)
	if err != nil {
		t.Fatalf("DoRequestWithStatus error: %v", err)
	}

	var result ProxyResult
	if err := json.Unmarshal([]byte(got), &result); err != nil {
		t.Fatalf("failed to parse result: %v", err)
	}

	if result.Status != 200 {
		t.Errorf("status = %d, want 200", result.Status)
	}
	if result.Body != `{"ok":true}` {
		t.Errorf("body = %q, want {\"ok\":true}", result.Body)
	}
	if result.Error != "" {
		t.Errorf("error should be empty on 200, got %q", result.Error)
	}
}

func TestDoRequestWithStatusReturns401(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
		_, _ = io.WriteString(w, `{"ok":false,"error":"unauthorized"}`)
	}))
	defer srv.Close()

	p := NewProxyService()
	got, err := p.DoRequestWithStatus(context.Background(), "GET", srv.URL, "", nil)
	if err != nil {
		t.Fatalf("DoRequestWithStatus should not return Go error on 401, got %v", err)
	}

	var result ProxyResult
	if err := json.Unmarshal([]byte(got), &result); err != nil {
		t.Fatalf("failed to parse result: %v", err)
	}

	if result.Status != 401 {
		t.Errorf("status = %d, want 401", result.Status)
	}
	if !strings.Contains(result.Body, "unauthorized") {
		t.Errorf("body should contain 'unauthorized', got %q", result.Body)
	}
}

func TestDoRequestWithStatusReturns502(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(502)
		_, _ = io.WriteString(w, "Bad Gateway")
	}))
	defer srv.Close()

	p := NewProxyService()
	got, _ := p.DoRequestWithStatus(context.Background(), "GET", srv.URL, "", nil)

	var result ProxyResult
	if err := json.Unmarshal([]byte(got), &result); err != nil {
		t.Fatalf("failed to parse result: %v", err)
	}

	if result.Status != 502 {
		t.Errorf("status = %d, want 502", result.Status)
	}
	if result.Body != "Bad Gateway" {
		t.Errorf("body = %q, want 'Bad Gateway'", result.Body)
	}
}

func TestDoRequestWithStatusNetworkError(t *testing.T) {
	p := NewProxyService()
	got, err := p.DoRequestWithStatus(context.Background(), "GET", "http://127.0.0.1:1/nonexistent", "", nil)
	if err != nil {
		t.Fatalf("DoRequestWithStatus should not return Go error on network failure, got %v", err)
	}

	var result ProxyResult
	if err := json.Unmarshal([]byte(got), &result); err != nil {
		t.Fatalf("failed to parse result: %v", err)
	}

	if result.Status != 0 {
		t.Errorf("status = %d, want 0 for network error", result.Status)
	}
	if result.Error == "" {
		t.Error("error should be populated for network failure")
	}
	if !strings.Contains(result.Error, "connection refused") && !strings.Contains(result.Error, "connect") {
		t.Errorf("error should mention connection failure, got %q", result.Error)
	}
}

func TestDoRequestWithStatusInjectsHeaders(t *testing.T) {
	var seenAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("Authorization")
		w.WriteHeader(200)
	}))
	defer srv.Close()

	p := NewProxyService()
	_, _ = p.DoRequestWithStatus(context.Background(), "POST", srv.URL, `{"x":1}`, map[string]string{
		"Authorization": "Bearer tok",
	})

	if seenAuth != "Bearer tok" {
		t.Errorf("Authorization = %q, want Bearer tok", seenAuth)
	}
}
