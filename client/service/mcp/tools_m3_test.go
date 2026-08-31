package mcp

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// ─── upload_local_file ───

func TestUploadLocalFileTool(t *testing.T) {
	var gotField string
	sess, _, _ := newFakeTS(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/files/uploads" || r.Method != http.MethodPost {
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
			return
		}
		if !strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
			t.Errorf("must be multipart, got %s", r.Header.Get("Content-Type"))
		}
		blob, _ := io.ReadAll(r.Body)
		if n := strings.Count(string(blob), "name=\"file\""); n != 1 {
			gotField = string(blob)
			return
		}
		writeEnvelope(w, `{"file_id":"f-up1","name":"probe.txt","size":6}`)
	})
	deps := Deps{Sess: sess, Sink: NewEventSink(2)}

	tmp := filepath.Join(t.TempDir(), "probe.txt")
	if err := os.WriteFile(tmp, []byte("hello!"), 0o644); err != nil {
		t.Fatal(err)
	}
	out := mcpCallTool(t, deps, "upload_local_file", map[string]any{
		"file_path": tmp,
	})
	text, perr := extractToolText(out)
	if perr != nil {
		t.Fatalf("上传失败: %v 原始=%s", perr, truncateForLog([]byte(out)))
	}
	if strings.Contains(text, gotField) && gotField != "" {
		t.Fatalf("multipart 缺少 file 字段: %s", truncateForLog([]byte(gotField)))
	}
	if !strings.Contains(text, `"file_id":"f-up1"`) {
		t.Fatalf("响应缺 file_id: %s", text)
	}
}

// ─── download_file ───

func TestDownloadFileWritesArtifact(t *testing.T) {
	content := []byte("\x50\x4b zip-bytes")
	sess, _, _ := newFakeTS(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/files/downloads/f-9" {
			t.Errorf("path=%s", r.URL.Path)
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write(content)
	})
	deps := Deps{Sess: sess, Sink: NewEventSink(2)}

	out := mcpCallTool(t, deps, "download_file", map[string]any{"file_id": "f-9"})
	text, perr := extractToolText(out)
	if perr != nil {
		t.Fatalf("取回失败: %v 原始=%s", perr, truncateForLog([]byte(out)))
	}
	var fields struct {
		Path   string `json:"path"`
		SHA256 string `json:"sha256"`
		Size   int64  `json:"size"`
	}
	if err := json.Unmarshal([]byte(text), &fields); err != nil {
		t.Fatalf("输出非法: %s", text)
	}
	blob, err := os.ReadFile(fields.Path)
	if err != nil || string(blob) != string(content) {
		t.Fatalf("落盘内容不符: err=%v len=%d want=%d", err, len(blob), len(content))
	}
	want := sha256Of(content)
	if fields.SHA256 != want || fields.Size != int64(len(content)) {
		t.Fatalf("指纹错误: %+v want sha=%s size=%d", fields, want, len(content))
	}
	if !strings.Contains(fields.Path, "iris-mcp-downloads") {
		t.Errorf("默认目录应为 iris-mcp-downloads: %s", fields.Path)
	}
}

// ─── save_screenshot ───

func TestSaveScreenshotArtifacts(t *testing.T) {
	png := []byte{0x89, 'P', 'N', 'G'}
	var gotQuery atomic.Value
	sess, _, _ := newFakeTS(t, func(w http.ResponseWriter, r *http.Request) {
		gotQuery.Store(r.URL.Query().Get("screenshot_id"))
		_, _ = w.Write(png)
	})
	deps := Deps{Sess: sess, Sink: NewEventSink(2)}

	out := mcpCallTool(t, deps, "save_screenshot", map[string]any{"screenshot_id": "shot-7"})
	if q, _ := gotQuery.Load().(string); q != "shot-7" {
		t.Fatalf("查询参数缺失: %q", q)
	}
	text, perr := extractToolText(out)
	if perr != nil {
		t.Fatalf("保存失败: %v 原始=%s", perr, truncateForLog([]byte(out)))
	}
	var fields map[string]any
	if err := json.Unmarshal([]byte(text), &fields); err != nil {
		t.Fatalf("输出非法: %s", text)
	}
	path, _ := fields["path"].(string)
	blob, err := os.ReadFile(path)
	if err != nil || string(blob) != string(png) {
		t.Fatalf("截图落盘不符: %v len=%d", err, len(blob))
	}
}

// ─── preview_remote_file: 等 WS 就绪帧 → 拉内容 → DELETE 释放 ───

func TestPreviewRemoteFileTextFlow(t *testing.T) {
	sink := NewEventSink(8)
	deleted := make(chan struct{}, 1)
	sess, srvURL, _ := newFakeTS(t, func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/preview"):
			body, _ := io.ReadAll(r.Body)
			if !strings.Contains(string(body), `"path":"C:\\flag.txt"`) {
				t.Errorf("create body = %s", body)
			}
			go func() {
				time.Sleep(80 * time.Millisecond)
				// 帧形状与真实 TeamServer 一致:元数据嵌套在 data.data(见 scripts/diag-preview-frame.mjs 抓帧)。
				sink.Emit("teamserver:ws:message", map[string]any{
					"data": `{"type":"COMMAND_EVENT","data":{"phase":"preview","status":"ready","command_id":28,` +
						`"data":{"preview_id":"pv-77","kind":"text","status":"ready",` +
						`"mime":"text/plain; charset=utf-8","file_name":"flag.txt","size":18,"reason":""}}}`,
				})
			}()
			writeEnvelope(w, `{"preview_id":"pv-77","kind":"text","mime":"text/plain; charset=utf-8","status":"receiving"}`)
		case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/api/v1/preview/pv-77"):
			_, _ = w.Write([]byte("root:hx#flag{mcp}\n"))
		case r.Method == http.MethodDelete && strings.Contains(r.URL.Path, "/api/v1/preview/pv-77"):
			deleted <- struct{}{}
			w.WriteHeader(http.StatusOK)
		default:
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
		}
	})
	deps := Deps{Sess: sess, Sink: sink}

	out := mcpCallTool(t, deps, "preview_remote_file", map[string]any{
		"beacon_id": "b-x", "remote_path": `C:\flag.txt`,
	})
	text, perr := extractToolText(out)
	if perr != nil {
		t.Fatalf("预览失败: %v 原始=%s", perr, truncateForLog([]byte(out)))
	}
	var fields struct {
		Kind    string `json:"kind"`
		Content string `json:"content"`
		Mime    string `json:"mime"`
		Size    int    `json:"size"`
	}
	if err := json.Unmarshal([]byte(text), &fields); err != nil {
		t.Fatalf("输出非法: %s", text)
	}
	if fields.Kind != "text" || !strings.Contains(fields.Content, "flag{mcp}") {
		t.Fatalf("内容不符: %+v", fields)
	}
	select {
	case <-deleted:
	case <-time.After(time.Second):
		t.Fatal("读取后未 DELETE 释放服务端内存")
	}
	_ = srvURL
}

func TestPreviewTooLargeSurfacesReason(t *testing.T) {
	sink := NewEventSink(4)
	sess, _, _ := newFakeTS(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/preview") {
			writeEnvelope(w, `{"preview_id":"pv-big","kind":"text","status":"receiving"}`)
			return
		}
	})
	deps := Deps{Sess: sess, Sink: sink}
	sink.Emit("teamserver:ws:message", map[string]any{
		"data": `{"type":"COMMAND_EVENT","data":{"phase":"preview","status":"failed","command_id":28,` +
			`"data":{"preview_id":"pv-big","kind":"text","status":"failed","reason":"too_large"}}}`,
	})

	out := mcpCallTool(t, deps, "preview_remote_file", map[string]any{
		"beacon_id": "b-x", "remote_path": `C:\big.bin`,
	})
	if !strings.Contains(out, `"isError":true`) {
		t.Fatalf("too_large 必须以工具错误呈现: %s", truncateForLog([]byte(out)))
	}
	if !strings.Contains(out, "too_large") || !strings.Contains(out, "DOWNLOAD") {
		t.Fatalf("缺少 reason 与改用 DOWNLOAD 的指引: %s", truncateForLog([]byte(out)))
	}
}
