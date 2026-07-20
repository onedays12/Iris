package plugin

import (
	"strings"
	"testing"
)

// ─── 简单 switch 类纯函数 ───

func TestIsPostExArgFlag(t *testing.T) {
	cases := []struct {
		in   string
		want bool
	}{
		{"--count", true},
		{"-c", true},
		{"--verbose", true},
		{"", false},
		{"count", false},
		{"  --count  ", true}, // trim 后合法
		// 含空白的不合法(会被 trim 掉的除外)
		{"--a b", false}, // 中间空格
	}
	for _, c := range cases {
		if got := isPostExArgFlag(c.in); got != c.want {
			t.Errorf("isPostExArgFlag(%q) = %v, want %v", c.in, got, c.want)
		}
	}
}

func TestIsSupportedPostExModuleArch(t *testing.T) {
	cases := []struct {
		in   string
		want bool
	}{
		{"x64", true},
		{"x86", true},
		{"  x64  ", true},
		{"amd64", false}, // module manifest 用 x64/x86,不是 amd64
		{"arm64", false},
		{"", false},
	}
	for _, c := range cases {
		if got := isSupportedPostExModuleArch(c.in); got != c.want {
			t.Errorf("isSupportedPostExModuleArch(%q) = %v, want %v", c.in, got, c.want)
		}
	}
}

func TestIsSupportedPostExManifestOutput(t *testing.T) {
	valid := []string{"metadata", "progress", "text", "artifact", "error", "done"}
	for _, ot := range valid {
		if !isSupportedPostExManifestOutput(ot) {
			t.Errorf("isSupportedPostExManifestOutput(%q) should be true", ot)
		}
	}
	invalid := []string{"", "json", "binary", "METADATA", " "}
	for _, ot := range invalid {
		if isSupportedPostExManifestOutput(ot) {
			t.Errorf("isSupportedPostExManifestOutput(%q) should be false", ot)
		}
	}
}

func TestIsSupportedPostExRole(t *testing.T) {
	valid := []string{
		"target_pid", "wait_ms", "max_runtime_ms", "idle_timeout_ms",
		"description", "spawn_path", "spawn_args",
	}
	for _, r := range valid {
		if !isSupportedPostExRole(r) {
			t.Errorf("isSupportedPostExRole(%q) should be true", r)
		}
	}
	// isSupportedPostExRole 内部 ToLower+TrimSpace,所以大小写/前后空白会被归一化
	invalid := []string{"", "pid", "sleep", " mode "}
	for _, r := range invalid {
		if isSupportedPostExRole(r) {
			t.Errorf("isSupportedPostExRole(%q) should be false", r)
		}
	}
	// 大小写归一化后应通过
	if !isSupportedPostExRole("TARGET_PID") {
		t.Error("isSupportedPostExRole should normalize case")
	}
}

func TestPostExModuleArchFromPluginArch(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"amd64", "x64"},
		{"x86", "x86"},
		{"x64", "x64"},   // normalizePluginArch 把 x64→amd64,再映射回 x64
		{"i386", "x86"},
		{"arm64", ""},
		{"", ""},
	}
	for _, c := range cases {
		if got := postExModuleArchFromPluginArch(c.in); got != c.want {
			t.Errorf("postExModuleArchFromPluginArch(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestContainsNormalizedPostExMode(t *testing.T) {
	items := []string{"spawn-dll", "inject-dll"}
	cases := []struct {
		value string
		want  bool
	}{
		{"spawn-dll", true},
		{"spawn_dll", true},
		{"spawn", true},
		{"SPAWN-DLL", true},
		{"inject", true},
		{"inject-dll", true},
		{"unknown", false},
		{"", false},
	}
	for _, c := range cases {
		if got := containsNormalizedPostExMode(items, c.value); got != c.want {
			t.Errorf("containsNormalizedPostExMode(_, %q) = %v, want %v", c.value, got, c.want)
		}
	}
}

// ─── validatePostExFields ───

func TestValidatePostExFieldsAcceptsValid(t *testing.T) {
	action := PluginAction{
		ID: "spawn",
		Fields: []PluginActionField{
			{Name: "pid", Type: "int32", Role: "target_pid"},
			{Name: "path", Type: "string", Role: "spawn_path", PostExArg: "--path"},
			{Name: "verbose", Type: "bool", PostExArg: "--verbose"},
		},
	}
	if err := validatePostExFields(action); err != nil {
		t.Fatalf("validatePostExFields should accept valid action: %v", err)
	}
}

func TestValidatePostExFieldsRejectsBadRole(t *testing.T) {
	action := PluginAction{
		ID:     "x",
		Fields: []PluginActionField{{Name: "f", Type: "string", Role: "unknown_role"}},
	}
	err := validatePostExFields(action)
	if err == nil || !strings.Contains(err.Error(), "unsupported postex field role") {
		t.Fatalf("expected unsupported role error, got %v", err)
	}
}

func TestValidatePostExFieldsRejectsBadPostExArg(t *testing.T) {
	action := PluginAction{
		ID:     "x",
		Fields: []PluginActionField{{Name: "f", Type: "string", PostExArg: "nodash"}},
	}
	err := validatePostExFields(action)
	if err == nil || !strings.Contains(err.Error(), "invalid postex_arg") {
		t.Fatalf("expected invalid postex_arg error, got %v", err)
	}
}

func TestValidatePostExFieldsRejectsRoleTypeMismatch(t *testing.T) {
	// target_pid 必须是 int32
	action := PluginAction{
		ID:     "x",
		Fields: []PluginActionField{{Name: "pid", Type: "string", Role: "target_pid"}},
	}
	err := validatePostExFields(action)
	if err == nil || !strings.Contains(err.Error(), "must use int32 type") {
		t.Fatalf("expected int32 type error, got %v", err)
	}

	// spawn_path 必须是 string
	action.Fields[0] = PluginActionField{Name: "p", Type: "int32", Role: "spawn_path"}
	err = validatePostExFields(action)
	if err == nil || !strings.Contains(err.Error(), "must use string type") {
		t.Fatalf("expected string type error, got %v", err)
	}
}

func TestHasPostExRoleField(t *testing.T) {
	action := PluginAction{
		Fields: []PluginActionField{
			{Name: "pid", Role: "target_pid"},
			{Name: "path", Role: "spawn_path"},
		},
	}
	if !hasPostExRoleField(action, "target_pid") {
		t.Error("should find target_pid")
	}
	if !hasPostExRoleField(action, "spawn_path") {
		t.Error("should find spawn_path")
	}
	if hasPostExRoleField(action, "wait_ms") {
		t.Error("should not find wait_ms")
	}
}

// ─── validatePostExManifestMatchesAction ───

func validManifestForMatch() postExModuleManifest {
	return postExModuleManifest{
		Execution: postExModuleManifestExecution{
			TargetModes: []string{"spawn-dll", "inject-dll"},
			Backends:    []string{"remote-thread"},
		},
		Module: postExModuleManifestModule{
			Arch: []string{"x64", "x86"},
		},
	}
}

func TestValidatePostExManifestMatchesActionAccepts(t *testing.T) {
	action := PluginAction{
		ID:   "spawn",
		Arch: []string{"amd64"},
		PostEx: &PluginPostExAction{
			Mode:    "spawn-dll",
			Backend: "remote-thread",
		},
	}
	if err := validatePostExManifestMatchesAction(action, validManifestForMatch()); err != nil {
		t.Fatalf("should accept matching action: %v", err)
	}
}

func TestValidatePostExManifestMatchesActionRejectsMode(t *testing.T) {
	action := PluginAction{
		ID:   "x",
		Arch: []string{"amd64"},
		PostEx: &PluginPostExAction{
			Mode:    "inject-dll",
			Backend: "remote-thread",
		},
	}
	m := validManifestForMatch()
	m.Execution.TargetModes = []string{"spawn-dll"} // 不含 inject
	err := validatePostExManifestMatchesAction(action, m)
	if err == nil || !strings.Contains(err.Error(), "does not include") {
		t.Fatalf("expected mode mismatch, got %v", err)
	}
}

func TestValidatePostExManifestMatchesActionRejectsArch(t *testing.T) {
	action := PluginAction{
		ID:   "x",
		Arch: []string{"amd64"},
		PostEx: &PluginPostExAction{
			Mode:    "spawn-dll",
			Backend: "remote-thread",
		},
	}
	m := validManifestForMatch()
	m.Module.Arch = []string{"x86"} // 不含 x64
	err := validatePostExManifestMatchesAction(action, m)
	if err == nil || !strings.Contains(err.Error(), "does not declare arch x64") {
		t.Fatalf("expected arch mismatch, got %v", err)
	}
}

// ─── lintPostExModuleManifest ───

func validPostExModuleManifest() postExModuleManifest {
	return postExModuleManifest{
		Schema:  "beacon.postex.module/v1",
		Name:    "test",
		Version: "1.0.0",
		Module: postExModuleManifestModule{
			ABI:    "postex/2.1",
			Format: "reflective-dll",
			Entry:  "REFLoader",
			Arch:   []string{"x64", "x86"},
			Files:  map[string]string{"x64": "a.dll", "x86": "b.dll"},
		},
		Execution: postExModuleManifestExecution{
			TargetModes:           []string{"spawn-dll", "inject-dll"},
			RecommendedTargetMode: "spawn-dll",
			Backends:              []string{"remote-thread"},
			RecommendedBackend:    "remote-thread",
			Transport:             "named-pipe",
			DefaultWaitMS:         3000,
		},
		Args: []postExModuleManifestArg{
			{Name: "count", Flag: "--count", Type: "int"},
		},
		Outputs: []postExModuleManifestOutput{{Type: "text"}},
	}
}

func TestLintPostExModuleManifestAcceptsValid(t *testing.T) {
	if err := lintPostExModuleManifest(validPostExModuleManifest()); err != nil {
		t.Fatalf("should accept valid manifest: %v", err)
	}
}

func TestLintPostExModuleManifestRejectsSchema(t *testing.T) {
	m := validPostExModuleManifest()
	m.Schema = "wrong"
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "schema must be")
}

func TestLintPostExModuleManifestRejectsMissingName(t *testing.T) {
	m := validPostExModuleManifest()
	m.Name = ""
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "name is required")
}

func TestLintPostExModuleManifestRejectsMissingVersion(t *testing.T) {
	m := validPostExModuleManifest()
	m.Version = "  "
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "version is required")
}

func TestLintPostExModuleManifestRejectsModuleABI(t *testing.T) {
	m := validPostExModuleManifest()
	m.Module.ABI = "postex/1.0"
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "module.abi must be")
}

func TestLintPostExModuleManifestRejectsModuleFormat(t *testing.T) {
	m := validPostExModuleManifest()
	m.Module.Format = "pe"
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "module.format must be")
}

func TestLintPostExModuleManifestRejectsModuleEntry(t *testing.T) {
	m := validPostExModuleManifest()
	m.Module.Entry = "DllMain"
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "module.entry must be")
}

func TestLintPostExModuleManifestRejectsEmptyArch(t *testing.T) {
	m := validPostExModuleManifest()
	m.Module.Arch = nil
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "module.arch is required")
}

func TestLintPostExModuleManifestRejectsUnsupportedArch(t *testing.T) {
	m := validPostExModuleManifest()
	m.Module.Arch = []string{"arm64"}
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "unsupported module arch")
}

func TestLintPostExModuleManifestRejectsEmptyFiles(t *testing.T) {
	m := validPostExModuleManifest()
	m.Module.Files = nil
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "module.files is required")
}

func TestLintPostExModuleManifestRejectsEmptyFileEntry(t *testing.T) {
	m := validPostExModuleManifest()
	m.Module.Files["x64"] = "  "
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "module.files.x64 is required")
}

func TestLintPostExModuleManifestRejectsEmptyTargetModes(t *testing.T) {
	m := validPostExModuleManifest()
	m.Execution.TargetModes = nil
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "execution.target_modes is required")
}

func TestLintPostExModuleManifestRejectsUnsupportedTargetMode(t *testing.T) {
	m := validPostExModuleManifest()
	m.Execution.TargetModes = []string{"bof"}
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "unsupported execution target mode")
}

func TestLintPostExModuleManifestRejectsBadRecommendedTargetMode(t *testing.T) {
	m := validPostExModuleManifest()
	m.Execution.RecommendedTargetMode = "bof"
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "recommended_target_mode must be in target_modes")
}

func TestLintPostExModuleManifestRejectsEmptyBackends(t *testing.T) {
	m := validPostExModuleManifest()
	m.Execution.Backends = nil
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "execution.backends is required")
}

func TestLintPostExModuleManifestRejectsUnsupportedBackend(t *testing.T) {
	m := validPostExModuleManifest()
	m.Execution.Backends = []string{"apc"}
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "unsupported execution backend")
}

func TestLintPostExModuleManifestRejectsBadRecommendedBackend(t *testing.T) {
	m := validPostExModuleManifest()
	m.Execution.RecommendedBackend = "apc"
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "recommended_backend must be remote-thread")
}

func TestLintPostExModuleManifestRejectsBadTransport(t *testing.T) {
	m := validPostExModuleManifest()
	m.Execution.Transport = "tcp"
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "execution.transport must be named-pipe")
}

func TestLintPostExModuleManifestRejectsNonPositiveWaitMS(t *testing.T) {
	m := validPostExModuleManifest()
	m.Execution.DefaultWaitMS = 0
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "execution.default_wait_ms must be positive")
}

func TestLintPostExModuleManifestRejectsArgMissingName(t *testing.T) {
	m := validPostExModuleManifest()
	m.Args = []postExModuleManifestArg{{Flag: "--c", Type: "int"}}
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "arg.name is required")
}

func TestLintPostExModuleManifestRejectsArgBadFlag(t *testing.T) {
	m := validPostExModuleManifest()
	m.Args = []postExModuleManifestArg{{Name: "c", Flag: "nodash", Type: "int"}}
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "invalid arg flag")
}

func TestLintPostExModuleManifestRejectsEnumWithoutChoices(t *testing.T) {
	m := validPostExModuleManifest()
	m.Args = []postExModuleManifestArg{{Name: "c", Flag: "--c", Type: "enum"}}
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "enum arg c requires choices")
}

func TestLintPostExModuleManifestRejectsUnsupportedArgType(t *testing.T) {
	m := validPostExModuleManifest()
	m.Args = []postExModuleManifestArg{{Name: "c", Flag: "--c", Type: "float"}}
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "unsupported arg type")
}

func TestLintPostExModuleManifestRejectsArgMinGtMax(t *testing.T) {
	m := validPostExModuleManifest()
	min, max := 100, 10
	m.Args = []postExModuleManifestArg{{Name: "c", Flag: "--c", Type: "int", Min: &min, Max: &max}}
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "has min greater than max")
}

func TestLintPostExModuleManifestRejectsEmptyOutputs(t *testing.T) {
	m := validPostExModuleManifest()
	m.Outputs = nil
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "outputs is required")
}

func TestLintPostExModuleManifestRejectsUnsupportedOutput(t *testing.T) {
	m := validPostExModuleManifest()
	m.Outputs = []postExModuleManifestOutput{{Type: "binary"}}
	expectErr(t, func() error { return lintPostExModuleManifest(m) }, "unsupported output type")
}

// ─── helper ───

func expectErr(t *testing.T, fn func() error, substr string) {
	t.Helper()
	err := fn()
	if err == nil {
		t.Fatalf("expected error containing %q, got nil", substr)
	}
	if !strings.Contains(err.Error(), substr) {
		t.Fatalf("expected error containing %q, got: %v", substr, err)
	}
}
