package plugin

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ─── schema v2 解码 ───

func TestDecodePluginManifestV2RejectsV1(t *testing.T) {
	_, err := decodePluginManifestV2([]byte(`{"name":"legacy","version":"1.0.0","actions":[]}`))
	if err == nil {
		t.Fatal("expected error for v1 manifest")
	}
	if !strings.Contains(err.Error(), "schema_version 2") {
		t.Fatalf("error should mention schema_version 2, got %v", err)
	}
}

func TestDecodePluginManifestV2RejectsUnknownField(t *testing.T) {
	_, err := decodePluginManifestV2([]byte(`{
		"schema_version": 2,
		"name": "p",
		"version": "1.0.0",
		"capabilities": {"command_ids": [70]},
		"unknow_field": true,
		"actions": [{"id": "noop"}]
	}`))
	if err == nil {
		t.Fatal("expected error for unknown field")
	}
	if !strings.Contains(err.Error(), "unknown field") {
		t.Fatalf("error should mention unknown field, got %v", err)
	}
}

func TestDecodePluginManifestV2LocalizedText(t *testing.T) {
	manifest, err := decodePluginManifestV2([]byte(`{
		"schema_version": 2,
		"name": "p",
		"display_name": {"zh": "执行与注入", "en": "Execution & Injection"},
		"description": "plain description",
		"version": "1.0.0",
		"capabilities": {"command_ids": [70]},
		"actions": [{"id": "noop", "label": {"zh": "动作", "en": "Action"}}]
	}`))
	if err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if got := manifest.DisplayName.Get("zh"); got != "执行与注入" {
		t.Fatalf("DisplayName.Get(zh) = %q", got)
	}
	if got := manifest.DisplayName.Get("en"); got != "Execution & Injection" {
		t.Fatalf("DisplayName.Get(en) = %q", got)
	}
	if got := manifest.Description.Text(); got != "plain description" {
		t.Fatalf("Description.Text() = %q", got)
	}
	if got := manifest.Actions[0].Label.Get("missing"); got != "Action" {
		t.Fatalf("Label fallback = %q, want en value", got)
	}
}

func TestLocalizedTextMarshalRoundTrip(t *testing.T) {
	plain := LocalizedText{Values: map[string]string{"default": "Whoami"}}
	data, err := plain.MarshalJSON()
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	if string(data) != `"Whoami"` {
		t.Fatalf("marshal = %s, want plain string", data)
	}
	var decoded LocalizedText
	if err := decoded.UnmarshalJSON(data); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if decoded.Text() != "Whoami" {
		t.Fatalf("round trip = %q", decoded.Text())
	}
}

// ─── 约定层 ───

func TestApplyManifestConventionsDerivesFields(t *testing.T) {
	manifest := PluginManifest{
		SchemaVersion: 2,
		Name:          "p",
		Actions: []PluginAction{
			{Artifact: "bin/whoami.x64.o"},
			{Artifact: "bin/Askcreds.x64.o", OS: []string{"linux"}},
			{Module: "m.manifest.json", PostEx: &PluginPostExAction{Mode: "spawn-dll"}},
		},
	}
	applyManifestConventions(&manifest)

	whoami := manifest.Actions[0]
	if whoami.ID != "whoami" {
		t.Fatalf("id = %q, want whoami", whoami.ID)
	}
	if normalizePluginActionKind(whoami.Kind) != "bof" {
		t.Fatalf("kind = %q, want bof", whoami.Kind)
	}
	if len(whoami.Arch) != 1 || whoami.Arch[0] != "amd64" {
		t.Fatalf("arch = %v, want [amd64]", whoami.Arch)
	}
	if len(whoami.OS) != 1 || whoami.OS[0] != "windows" {
		t.Fatalf("os = %v, want [windows]", whoami.OS)
	}
	if whoami.Label.Text() != "whoami" {
		t.Fatalf("label = %q, want whoami", whoami.Label.Text())
	}

	askcreds := manifest.Actions[1]
	if askcreds.OS[0] != "linux" {
		t.Fatalf("explicit os should be preserved, got %v", askcreds.OS)
	}

	postex := manifest.Actions[2]
	if postex.ID != "m-spawn-dll" {
		t.Fatalf("postex derived id = %q, want m-spawn-dll", postex.ID)
	}
}

// ─── v2 校验: capabilities + hashes ───

func TestValidateManifestV2RequiresCapabilities(t *testing.T) {
	root := t.TempDir()
	manifest := PluginManifest{Name: "p", Actions: []PluginAction{{ID: "noop"}}}
	err := validateManifestV2(root, manifest)
	if err == nil || !strings.Contains(err.Error(), "capabilities") {
		t.Fatalf("expected capabilities error, got %v", err)
	}
}

func TestValidateManifestV2CommandIDMustBeInCapabilities(t *testing.T) {
	root := t.TempDir()
	manifest := PluginManifest{
		Name:         "p",
		Capabilities: &PluginCapabilities{CommandIDs: []int{70}},
		Actions:      []PluginAction{{ID: "bad", CommandID: 90}},
	}
	err := validateManifestV2(root, manifest)
	if err == nil || !strings.Contains(err.Error(), "capabilities.command_ids") {
		t.Fatalf("expected capabilities mismatch error, got %v", err)
	}
}

func sha256Hex(t *testing.T, data []byte) string {
	t.Helper()
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func TestVerifyManifestHashesMismatchAndMissing(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "bin"), 0755); err != nil {
		t.Fatalf("mkdir failed: %v", err)
	}
	content := []byte("artifact-bytes")
	if err := os.WriteFile(filepath.Join(root, "bin", "a.x64.o"), content, 0644); err != nil {
		t.Fatalf("write artifact failed: %v", err)
	}

	// 哈希不匹配
	manifest := PluginManifest{
		Name:         "p",
		Capabilities: &PluginCapabilities{CommandIDs: []int{70}},
		Hashes:       map[string]string{"bin/a.x64.o": strings.Repeat("0", 64)},
		Actions:      []PluginAction{{ID: "a", Artifact: "bin/a.x64.o"}},
	}
	err := validateManifestV2(root, manifest)
	if err == nil || !strings.Contains(err.Error(), "hash mismatch") {
		t.Fatalf("expected hash mismatch error, got %v", err)
	}

	// 引用但未声明
	manifest.Hashes = map[string]string{}
	err = validateManifestV2(root, manifest)
	if err == nil || !strings.Contains(err.Error(), "not declared in hashes") {
		t.Fatalf("expected missing-hash error, got %v", err)
	}

	// 正确哈希 + 能力 → 通过
	manifest.Hashes = map[string]string{"bin/a.x64.o": sha256Hex(t, content)}
	manifest.Capabilities = &PluginCapabilities{CommandIDs: []int{70}}
	if err := validateManifestV2(root, manifest); err != nil {
		t.Fatalf("expected valid manifest, got %v", err)
	}
}

// ─── PostEx module 派生 ───

func TestDerivePostExFromModule(t *testing.T) {
	root := writeTestPostExDLL(t)
	writeTestPostExModuleManifest(t, root, validPostExModuleManifestJSON())

	actions := []PluginAction{
		{ID: "spawn", Kind: "postex", Module: "postex-template.manifest.json"},
		{
			ID: "inject", Kind: "postex", Module: "postex-template.manifest.json",
			PostEx: &PluginPostExAction{Mode: "inject-dll", Description: "postex-template-inject"},
		},
	}
	if err := derivePostExFromModule(root, actions); err != nil {
		t.Fatalf("derive failed: %v", err)
	}

	spawn := actions[0]
	if spawn.PostEx == nil {
		t.Fatal("postex config not derived")
	}
	if normalizePostExMode(spawn.PostEx.Mode) != "spawn-dll" {
		t.Fatalf("mode = %q, want spawn-dll (recommended_target_mode)", spawn.PostEx.Mode)
	}
	if spawn.PostEx.Backend != "remote-thread" {
		t.Fatalf("backend = %q", spawn.PostEx.Backend)
	}
	if spawn.PostEx.WaitMS != 3000 {
		t.Fatalf("wait_ms = %d, want 3000 (default_wait_ms)", spawn.PostEx.WaitMS)
	}
	if spawn.PostEx.SpawnPath != `C:\Windows\System32\cmd.exe` {
		t.Fatalf("spawn_path convention = %q", spawn.PostEx.SpawnPath)
	}
	if len(spawn.PostEx.DLLByArch) != 2 || spawn.PostEx.DLLByArch["amd64"] != "bin/postex_template.x64.dll" {
		t.Fatalf("dll_by_arch = %v", spawn.PostEx.DLLByArch)
	}
	if len(spawn.Arch) != 2 || spawn.Arch[0] != "amd64" || spawn.Arch[1] != "x86" {
		t.Fatalf("arch = %v, want [amd64 x86]", spawn.Arch)
	}

	countField := findDerivedField(t, spawn.Fields, "count")
	if countField == nil {
		t.Fatal("module arg count not derived")
	}
	if countField.Type != "int32" || countField.PostExArg != "--count" || fmt.Sprint(countField.Default) != "3" {
		t.Fatalf("derived count field = %+v", countField)
	}

	inject := actions[1]
	if !hasPostExRoleField(inject, "target_pid") {
		t.Fatal("inject-dll should get synthetic target_pid field")
	}
	if inject.PostEx.SpawnPath != "" {
		t.Fatalf("inject-dll should not get spawn_path convention, got %q", inject.PostEx.SpawnPath)
	}
}

func findDerivedField(t *testing.T, fields []PluginActionField, name string) *PluginActionField {
	t.Helper()
	for i := range fields {
		if fields[i].Name == name {
			return &fields[i]
		}
	}
	return nil
}

// ─── dispatch capabilities 强制 ───

func TestDispatchActionCapabilityEnforced(t *testing.T) {
	// 白名单只允许 70; action 声明 90 → 在发出任何 HTTP 请求前被拒。
	var requests int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		w.WriteHeader(200)
		_, _ = io.WriteString(w, `{"ok":true}`)
	}))
	defer srv.Close()

	plugin := &PluginInstance{
		ID: "p",
		Manifest: PluginManifest{
			Name:         "p",
			Capabilities: &PluginCapabilities{CommandIDs: []int{70}},
		},
	}
	action := PluginAction{ID: "a", Kind: "bof", CommandID: 90}

	err := (&PluginManager{}).dispatchAction(context.Background(), plugin, action, map[string]any{
		"beacon_id": "b1", "api_base": srv.URL, "token": "tok",
	})
	if err == nil || !strings.Contains(err.Error(), "not allowed to dispatch command 90") {
		t.Fatalf("expected capability rejection, got %v", err)
	}
	if requests != 0 {
		t.Fatalf("no HTTP request should be sent, got %d", requests)
	}

	// 白名单内 command → 正常派发
	allowed := PluginAction{ID: "ok", Kind: "bof", CommandID: 70}
	if err := (&PluginManager{}).dispatchAction(context.Background(), plugin, allowed, map[string]any{
		"beacon_id": "b1", "api_base": srv.URL, "token": "tok",
	}); err != nil {
		t.Fatalf("allowed command should dispatch, got %v", err)
	}
	if requests != 1 {
		t.Fatalf("expected 1 request, got %d", requests)
	}
}

// ─── 快照序列化: requires_input 省略约定 ───

func TestPluginActionRequiresInputOmitEmpty(t *testing.T) {
	// 零值(false)时必须省略键: 前端按 v2 约定回退为"有字段即需要输入",
	// 否则 requires_input:false 会短路前端回退, 有字段的动作也不弹参数框。
	zero, err := json.Marshal(PluginAction{ID: "noop"})
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	if strings.Contains(string(zero), "requires_input") {
		t.Fatalf("zero value must omit requires_input, got %s", zero)
	}

	// 显式 true 时输出键(允许无字段动作强制要求输入)。
	explicit, err := json.Marshal(PluginAction{ID: "noop", RequiresInput: true})
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	if !strings.Contains(string(explicit), `"requires_input":true`) {
		t.Fatalf("explicit true must emit requires_input, got %s", explicit)
	}
}
