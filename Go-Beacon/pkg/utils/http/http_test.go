package http

import (
	"beacon/pkg/profile"
	"bytes"
	"testing"
)

func TestSelectTransformMethod(t *testing.T) {
	var transform profile.HTTPTransformConfig
	transform.Present = true
	transform.Version = 1
	transform.Get.Metadata.Present = true
	transform.Get.ServerOutput.Present = true
	transform.Post.Metadata.Present = true
	transform.Post.StageOutput.Present = true
	transform.Post.ServerOutput.Present = true

	method, name, ok := selectTransformMethod(transform, false, "")
	if !ok || name != "GET" || !method.Metadata.Present {
		t.Fatalf("unexpected GET selection: ok=%v name=%q method=%+v", ok, name, method)
	}

	method, name, ok = selectTransformMethod(transform, true, "")
	if !ok || name != "POST" || !method.StageOutput.Present {
		t.Fatalf("unexpected POST selection: ok=%v name=%q method=%+v", ok, name, method)
	}
}

func TestTransformEncodeDecodeBase64(t *testing.T) {
	spec := profile.HTTPDataTransform{
		Present:    true,
		Encoding:   2,
		Prefix:     "pre-",
		Suffix:     "-suf",
		OutputMode: 2,
	}

	wire, err := transformEncode(&spec, []byte("hello"))
	if err != nil {
		t.Fatalf("transformEncode failed: %v", err)
	}
	if string(wire) != "pre-aGVsbG8=-suf" {
		t.Fatalf("unexpected wire: %q", wire)
	}

	plain, err := transformDecode(&spec, wire)
	if err != nil {
		t.Fatalf("transformDecode failed: %v", err)
	}
	if !bytes.Equal(plain, []byte("hello")) {
		t.Fatalf("unexpected plain: %q", plain)
	}
}

func TestIsNoTaskHTTPBody(t *testing.T) {
	if !isNoTaskHTTPBody(nil) {
		t.Fatalf("nil response should be no-task")
	}
	if !isNoTaskHTTPBody([]byte("404 page not found")) {
		t.Fatalf("404 body should be no-task")
	}
	if isNoTaskHTTPBody([]byte("not base64")) {
		t.Fatalf("arbitrary body should not be no-task")
	}
}

func TestURLCodeBytes(t *testing.T) {
	got := urlEncodeBytes([]byte("a b/+"))
	if got != "a%20b%2F%2B" {
		t.Fatalf("urlEncodeBytes = %q", got)
	}
}
