package plugin

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"irisclient/service/internal/args"
)

func TestNormalizeManifestCommandArgsKeepsShort(t *testing.T) {
	got, err := args.NormalizeManifestCommandArgs([]args.BeaconCommandArg{
		{Kind: "int32", Value: 1234},
		{Kind: "short", Value: 77},
		{Kind: "int16", Value: "-9"},
		{Kind: "string", Value: "hello-elf-bof"},
	})
	if err != nil {
		t.Fatalf("normalizeManifestCommandArgs returned error: %v", err)
	}
	if len(got) != 4 {
		t.Fatalf("expected 4 args, got %d", len(got))
	}
	if got[0].Kind != "int32" || got[0].Value != int32(1234) {
		t.Fatalf("unexpected int32 arg: %#v", got[0])
	}
	if got[1].Kind != "short" || got[1].Value != int16(77) {
		t.Fatalf("unexpected short arg: %#v", got[1])
	}
	if got[2].Kind != "short" || got[2].Value != int16(-9) {
		t.Fatalf("unexpected int16 alias arg: %#v", got[2])
	}
	if got[3].Kind != "string" || got[3].Value != "hello-elf-bof" {
		t.Fatalf("unexpected string arg: %#v", got[3])
	}
}

func TestBuildPluginArgsFileFieldMapsToBytes(t *testing.T) {
	action := PluginAction{
		Fields: []PluginActionField{
			{Name: "op", Type: "string"},
			{Name: "blob", Type: "file"},
		},
	}
	got, err := buildPluginArgs(action, map[string]any{
		"values": map[string]any{
			"op":   "load",
			"blob": "QQ==",
		},
	})
	if err != nil {
		t.Fatalf("buildPluginArgs: %v", err)
	}
	want := []args.BeaconCommandArg{
		{Kind: "string", Value: "load"},
		{Kind: "bytes", Value: "QQ=="},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("args = %#v, want %#v", got, want)
	}
}

func TestBuildPostExSpawnPluginArgs(t *testing.T) {
	action := PluginAction{
		ID:          "spawn",
		Kind:        "postex",
		Description: LocalizedText{Values: map[string]string{"default": "spawn test"}},
		PostEx: &PluginPostExAction{
			Mode:          "spawn-dll",
			DLLData:       "dll-b64",
			WaitMS:        4000,
			MaxRuntimeMS:  15000,
			IdleTimeoutMS: 5000,
			SpawnPath:     `C:\Windows\System32\notepad.exe`,
			SpawnArgs:     "",
		},
		Fields: []PluginActionField{
			{Name: "count", Type: "int32", Default: 3, PostExArg: "--count"},
			{Name: "verbose", Type: "bool", Default: false, PostExArg: "--verbose"},
		},
	}

	got, err := buildPostExPluginArgs(action, map[string]any{
		"beacon_os": "windows",
		"values": map[string]any{
			"count":   5,
			"verbose": true,
		},
	})
	if err != nil {
		t.Fatalf("buildPostExPluginArgs returned error: %v", err)
	}
	want := []args.BeaconCommandArg{
		{Kind: "int32", Value: int32(5)},
		{Kind: "int32", Value: int32(4000)},
		{Kind: "int32", Value: int32(15000)},
		{Kind: "int32", Value: int32(5000)},
		{Kind: "string", Value: "spawn test"},
		{Kind: "string", Value: "--count 5 --verbose"},
		{Kind: "string", Value: `C:\Windows\System32\notepad.exe`},
		{Kind: "string", Value: ""},
		{Kind: "bytes", Value: "dll-b64"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("postex spawn args mismatch:\n got %#v\nwant %#v", got, want)
	}
}

func TestBuildPostExSpawnPluginArgsUsesSpawnPathByArch(t *testing.T) {
	action := PluginAction{
		ID:   "spawn",
		Kind: "postex",
		PostEx: &PluginPostExAction{
			Mode:      "spawn-dll",
			DLLData:   "dll-b64",
			WaitMS:    3000,
			SpawnPath: `C:\Windows\System32\cmd.exe`,
			SpawnPathByArch: map[string]string{
				"amd64": `C:\Windows\System32\cmd.exe`,
				"x86":   `C:\Windows\SysWOW64\cmd.exe`,
			},
		},
		Fields: []PluginActionField{
			{
				Name:    "spawn_path",
				Type:    "string",
				Role:    "spawn_path",
				Default: `C:\Windows\System32\cmd.exe`,
				DefaultByArch: map[string]any{
					"amd64": `C:\Windows\System32\cmd.exe`,
					"x86":   `C:\Windows\SysWOW64\cmd.exe`,
				},
			},
		},
	}

	got, err := buildPostExPluginArgs(action, map[string]any{
		"beacon_os":   "windows",
		"beacon_arch": "x86",
	})
	if err != nil {
		t.Fatalf("buildPostExPluginArgs returned error: %v", err)
	}
	if got[6].Kind != "string" || got[6].Value != `C:\Windows\SysWOW64\cmd.exe` {
		t.Fatalf("expected x86 spawn path, got %#v", got[6])
	}
}

func TestBuildPostExInjectPluginArgsUsesTargetPIDRole(t *testing.T) {
	action := PluginAction{
		ID:   "inject",
		Kind: "postex",
		PostEx: &PluginPostExAction{
			Mode:    "inject-dll",
			DLLData: "dll-b64",
		},
		Fields: []PluginActionField{
			{Name: "pid", Type: "int32", Role: "target_pid"},
			{Name: "name", Type: "string", PostExArg: "--name"},
		},
	}

	got, err := buildPostExPluginArgs(action, map[string]any{
		"beacon_os": "windows",
		"values": map[string]any{
			"pid":  1234,
			"name": "alpha beta",
		},
	})
	if err != nil {
		t.Fatalf("buildPostExPluginArgs returned error: %v", err)
	}
	want := []args.BeaconCommandArg{
		{Kind: "int32", Value: int32(6)},
		{Kind: "int32", Value: int32(3000)},
		{Kind: "int32", Value: int32(0)},
		{Kind: "int32", Value: int32(0)},
		{Kind: "string", Value: "postex"},
		{Kind: "string", Value: `--name "alpha beta"`},
		{Kind: "int32", Value: int32(1234)},
		{Kind: "bytes", Value: "dll-b64"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("postex inject args mismatch:\n got %#v\nwant %#v", got, want)
	}
}

func TestValidatePostExManifestAcceptsPackageV1(t *testing.T) {
	root := writeTestPostExDLL(t)
	writeTestPostExModuleManifest(t, root, validPostExModuleManifestJSON())
	manifest := PluginManifest{
		Name: "postex-test",
		Actions: []PluginAction{
			{
				ID:   "spawn",
				Kind: "postex",
				OS:   []string{"windows"},
				Arch: []string{"amd64"},
				PostEx: &PluginPostExAction{
					Mode:      "spawn-dll",
					DLLByArch: map[string]string{"amd64": "bin/postex_template.x64.dll"},
					Manifest:  "postex-template.manifest.json",
					WaitMS:    3000,
					SpawnPath: `C:\Windows\System32\cmd.exe`,
					Backend:   postExBackendRemoteThread,
				},
				Fields: []PluginActionField{
					{Name: "count", Type: "int32", Default: 3, PostExArg: "--count"},
				},
			},
			{
				ID:   "inject",
				Kind: "postex",
				OS:   []string{"windows"},
				Arch: []string{"amd64"},
				PostEx: &PluginPostExAction{
					Mode:     "inject-dll",
					DLL:      "bin/postex_template.x64.dll",
					Manifest: "postex-template.manifest.json",
					WaitMS:   3000,
					Backend:  postExBackendRemoteThread,
				},
				Fields: []PluginActionField{
					{Name: "pid", Type: "int32", Required: true, Role: "target_pid"},
				},
			},
		},
	}

	if err := normalizePluginActionFields(manifest.Actions); err != nil {
		t.Fatalf("normalizePluginActionFields returned error: %v", err)
	}
	manifest.Actions = hydratePluginActions(root, manifest.Actions)
	if err := validatePluginManifest(root, manifest); err != nil {
		t.Fatalf("validatePluginManifest returned error: %v", err)
	}
}

func TestValidatePostExManifestRejectsInvalidModuleManifest(t *testing.T) {
	root := writeTestPostExDLL(t)
	writeTestPostExModuleManifest(t, root, strings.Replace(validPostExModuleManifestJSON(), `"transport": "named-pipe"`, `"transport": "tcp"`, 1))
	manifest := PluginManifest{
		Name: "postex-test",
		Actions: []PluginAction{
			{
				ID:   "spawn",
				Kind: "postex",
				OS:   []string{"windows"},
				Arch: []string{"amd64"},
				PostEx: &PluginPostExAction{
					Mode:      "spawn-dll",
					DLLByArch: map[string]string{"amd64": "bin/postex_template.x64.dll"},
					Manifest:  "postex-template.manifest.json",
					WaitMS:    3000,
					SpawnPath: `C:\Windows\System32\cmd.exe`,
					Backend:   postExBackendRemoteThread,
				},
			},
		},
	}

	if err := normalizePluginActionFields(manifest.Actions); err != nil {
		t.Fatalf("normalizePluginActionFields returned error: %v", err)
	}
	err := validatePluginManifest(root, manifest)
	if err == nil || !strings.Contains(err.Error(), "execution.transport must be named-pipe") {
		t.Fatalf("expected invalid module manifest validation error, got %v", err)
	}
}

func TestValidatePostExManifestRejectsModuleArchMismatch(t *testing.T) {
	root := writeTestPostExDLL(t)
	writeTestPostExModuleManifest(t, root, strings.Replace(validPostExModuleManifestJSON(), `"arch": ["x64", "x86"]`, `"arch": ["x86"]`, 1))
	manifest := PluginManifest{
		Name: "postex-test",
		Actions: []PluginAction{
			{
				ID:   "spawn",
				Kind: "postex",
				OS:   []string{"windows"},
				Arch: []string{"amd64"},
				PostEx: &PluginPostExAction{
					Mode:      "spawn-dll",
					DLLByArch: map[string]string{"amd64": "bin/postex_template.x64.dll"},
					Manifest:  "postex-template.manifest.json",
					WaitMS:    3000,
					SpawnPath: `C:\Windows\System32\cmd.exe`,
					Backend:   postExBackendRemoteThread,
				},
			},
		},
	}

	if err := normalizePluginActionFields(manifest.Actions); err != nil {
		t.Fatalf("normalizePluginActionFields returned error: %v", err)
	}
	err := validatePluginManifest(root, manifest)
	if err == nil || !strings.Contains(err.Error(), "module.arch does not declare arch x64") {
		t.Fatalf("expected module arch mismatch validation error, got %v", err)
	}
}

func TestValidatePostExManifestRejectsMissingDLL(t *testing.T) {
	root := t.TempDir()
	manifest := PluginManifest{
		Name: "postex-test",
		Actions: []PluginAction{
			{
				ID:   "spawn",
				Kind: "postex",
				OS:   []string{"windows"},
				PostEx: &PluginPostExAction{
					Mode:      "spawn-dll",
					DLL:       "bin/missing.dll",
					WaitMS:    3000,
					SpawnPath: `C:\Windows\System32\cmd.exe`,
					Backend:   postExBackendRemoteThread,
				},
			},
		},
	}

	err := validatePluginManifest(root, manifest)
	if err == nil || !strings.Contains(err.Error(), "invalid postex dll") {
		t.Fatalf("expected missing dll validation error, got %v", err)
	}
}

func TestValidatePostExManifestRejectsUnsupportedBackend(t *testing.T) {
	root := writeTestPostExDLL(t)
	manifest := PluginManifest{
		Name: "postex-test",
		Actions: []PluginAction{
			{
				ID:   "spawn",
				Kind: "postex",
				OS:   []string{"windows"},
				PostEx: &PluginPostExAction{
					Mode:      "spawn-dll",
					DLL:       "bin/postex_template.x64.dll",
					WaitMS:    3000,
					SpawnPath: `C:\Windows\System32\cmd.exe`,
					Backend:   "apc",
				},
			},
		},
	}

	err := validatePluginManifest(root, manifest)
	if err == nil || !strings.Contains(err.Error(), "unsupported postex backend") {
		t.Fatalf("expected backend validation error, got %v", err)
	}
}

func TestValidatePostExManifestRejectsInjectWithoutTargetPID(t *testing.T) {
	root := writeTestPostExDLL(t)
	manifest := PluginManifest{
		Name: "postex-test",
		Actions: []PluginAction{
			{
				ID:   "inject",
				Kind: "postex",
				OS:   []string{"windows"},
				PostEx: &PluginPostExAction{
					Mode:    "inject-dll",
					DLL:     "bin/postex_template.x64.dll",
					WaitMS:  3000,
					Backend: postExBackendRemoteThread,
				},
			},
		},
	}

	err := validatePluginManifest(root, manifest)
	if err == nil || !strings.Contains(err.Error(), "target_pid field is required") {
		t.Fatalf("expected target_pid validation error, got %v", err)
	}
}

func TestLoadPostExTemplatePluginPackage(t *testing.T) {
	root := filepath.Join("..", "..", "..", "plugins", "postex-template")
	if _, err := os.Stat(filepath.Join(root, "plugin.json")); err != nil {
		t.Skipf("postex template plugin is not available: %v", err)
	}

	manager := &PluginManager{}
	plugin, err := manager.loadPlugin(root)
	if err != nil {
		t.Fatalf("loadPlugin returned error: %v", err)
	}
	if plugin == nil {
		t.Fatalf("expected plugin instance")
	}
	if plugin.Status != "ready" {
		t.Fatalf("expected ready plugin, got %s: %s", plugin.Status, plugin.LastError)
	}
		if len(plugin.Manifest.Actions) != 2 {
			t.Fatalf("expected 2 actions, got %d", len(plugin.Manifest.Actions))
		}
	}

	func TestLoadPoolPartyPluginPackage(t *testing.T) {
		root := filepath.Join("..", "..", "..", "plugins", "poolparty")
		if _, err := os.Stat(filepath.Join(root, "plugin.json")); err != nil {
			t.Skipf("poolparty plugin is not available: %v", err)
		}

		manager := &PluginManager{}
		plugin, err := manager.loadPlugin(root)
		if err != nil {
			t.Fatalf("loadPlugin returned error: %v", err)
		}
		if plugin == nil {
			t.Fatalf("expected plugin instance")
		}
		if plugin.Status != "ready" {
			t.Fatalf("expected ready plugin, got %s: %s", plugin.Status, plugin.LastError)
		}
		if plugin.Manifest.Name != "poolparty" {
			t.Fatalf("name = %q, want poolparty", plugin.Manifest.Name)
		}
		if len(plugin.Manifest.Actions) != 7 {
			t.Fatalf("expected 7 actions, got %d", len(plugin.Manifest.Actions))
		}

		wantIDs := []string{"tp_work", "tp_wait", "tp_io", "tp_alpc", "tp_job", "tp_direct", "tp_timer"}
		named := map[string]bool{"tp_wait": true, "tp_io": true, "tp_alpc": true, "tp_job": true}
		for i, action := range plugin.Manifest.Actions {
			if action.ID != wantIDs[i] {
				t.Fatalf("actions[%d].ID = %q, want %q", i, action.ID, wantIDs[i])
			}
			if action.CommandID != 0 && action.CommandID != defaultExecutionBOFCommandID {
				t.Fatalf("action %s command_id = %d, want 70 or omitted", action.ID, action.CommandID)
			}
			if len(action.Arch) != 1 || action.Arch[0] != "amd64" {
				t.Fatalf("action %s arch = %#v, want [amd64]", action.ID, action.Arch)
			}
			if len(action.Fields) < 2 || action.Fields[0].Name != "pid" || action.Fields[1].Name != "shellcode" {
				t.Fatalf("action %s fields = %#v, want pid then shellcode", action.ID, action.Fields)
			}
			if named[action.ID] {
				if len(action.Fields) != 3 || action.Fields[2].Name != "name" {
					t.Fatalf("action %s should have optional name as field[2]", action.ID)
				}
			} else if len(action.Fields) != 2 {
				t.Fatalf("action %s should have exactly pid+shellcode", action.ID)
			}
		}
	}

func writeTestPostExDLL(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	bin := filepath.Join(root, "bin")
	if err := os.MkdirAll(bin, 0755); err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(bin, "postex_template.x64.dll"), []byte("dll"), 0644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}
	return root
}

func writeTestPostExModuleManifest(t *testing.T, root string, body string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(root, "postex-template.manifest.json"), []byte(body), 0644); err != nil {
		t.Fatalf("WriteFile manifest failed: %v", err)
	}
}

func validPostExModuleManifestJSON() string {
	return `{
  "schema": "beacon.postex.module/v1",
  "name": "postex_module_template",
  "display_name": "PostEx Module Template",
  "version": "1.0.0",
  "description": "Template PostEx module.",
  "module": {
    "abi": "postex/2.1",
    "format": "reflective-dll",
    "entry": "REFLoader",
    "arch": ["x64", "x86"],
    "files": {
      "x64": "bin/postex_template.x64.dll",
      "x86": "bin/postex_template.x86.dll"
    }
  },
  "execution": {
    "target_modes": ["spawn-dll", "inject-dll"],
    "recommended_target_mode": "spawn-dll",
    "backends": ["remote-thread"],
    "recommended_backend": "remote-thread",
    "transport": "named-pipe",
    "default_wait_ms": 3000,
    "supports_cancel": true
  },
  "args": [
    {
      "name": "count",
      "flag": "--count",
      "type": "int",
      "required": false,
      "default": 3,
      "min": 1,
      "max": 10000,
      "description": "Number of iterations."
    }
  ],
  "outputs": [
    { "type": "metadata", "format": "json" },
    { "type": "progress", "format": "json" },
    { "type": "text", "format": "utf-8" },
    { "type": "artifact", "mime": ["text/plain"] },
    { "type": "error", "format": "postex-error-v1" },
    { "type": "done" }
  ]
}`
}
