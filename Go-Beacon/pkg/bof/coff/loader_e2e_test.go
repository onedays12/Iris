//go:build windows && amd64

package coff

import (
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

func testdataBofDir() string {
	return filepath.Join("testdata", "bof")
}

type compiler struct {
	name    string
	compile func(t *testing.T, src, out string) error
}

func findCompilers() []compiler {
	var cs []compiler
	if gcc, err := exec.LookPath("gcc"); err == nil {
		gccPath := gcc
		cs = append(cs, compiler{
			name: "gcc",
			compile: func(t *testing.T, src, out string) error {
				cmd := exec.Command(gccPath, "-c", "-O0", "-fno-omit-frame-pointer",
					"-I"+testdataBofDir(), "-o", out, src)
				if b, err := cmd.CombinedOutput(); err != nil {
					t.Logf("gcc output: %s", b)
					return err
				}
				return nil
			},
		})
	}
	if clPath := findCl(); clPath != "" {
		vcvars := findVcvars()
		cs = append(cs, compiler{
			name: "cl",
			compile: func(t *testing.T, src, out string) error {
				// 通过临时 .bat 调用 vcvars64 + cl，避免 cmd /c 内联的引号处理问题
				absDir, _ := filepath.Abs(testdataBofDir())
				absSrc, _ := filepath.Abs(src)
				absOut, _ := filepath.Abs(out)
				bat := filepath.Join(filepath.Dir(absOut), "cl.bat")
				script := "@echo off\r\ncall \"" + vcvars + "\" >nul 2>&1\r\ncl /nologo /c /O1 /I\"" + absDir + "\" /Fo\"" + absOut + "\" \"" + absSrc + "\"\r\n"
				if err := os.WriteFile(bat, []byte(script), 0o644); err != nil {
					return err
				}
				cmd := exec.Command(bat)
				if b, err := cmd.CombinedOutput(); err != nil {
					t.Logf("cl output: %s", b)
					return err
				}
				return nil
			},
		})
	}
	return cs
}

func findCl() string {
	vswhere := `C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe`
	if _, err := os.Stat(vswhere); err != nil {
		return ""
	}
	out, err := exec.Command(vswhere, "-latest", "-products", "*", "-property", "installationPath").Output()
	if err != nil || len(out) == 0 {
		return ""
	}
	vs := strings.TrimSpace(string(out))
	matches, _ := filepath.Glob(filepath.Join(vs, "VC", "Tools", "MSVC", "*", "bin", "Hostx64", "x64", "cl.exe"))
	if len(matches) == 0 {
		return ""
	}
	sort.Strings(matches)
	return matches[len(matches)-1]
}

func findVcvars() string {
	vswhere := `C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe`
	out, err := exec.Command(vswhere, "-latest", "-products", "*", "-property", "installationPath").Output()
	if err != nil || len(out) == 0 {
		return ""
	}
	vs := strings.TrimSpace(string(out))
	v := filepath.Join(vs, "VC", "Auxiliary", "Build", "vcvars64.bat")
	if _, err := os.Stat(v); err != nil {
		return ""
	}
	return v
}

type bofCase struct {
	name      string
	src       string
	args      []byte
	stopEvent uintptr
	want      []string
	notWant   []string
}

func runBofCase(t *testing.T, c *compiler, tc bofCase) {
	t.Helper()
	dir := t.TempDir()
	ext := ".obj"
	if c.name == "gcc" {
		ext = ".o"
	}
	obj := filepath.Join(dir, tc.name+ext)
	src := filepath.Join(testdataBofDir(), tc.src)
	if err := c.compile(t, src, obj); err != nil {
		t.Fatalf("compile %s: %v", tc.src, err)
	}
	data, err := os.ReadFile(obj)
	if err != nil {
		t.Fatalf("read obj: %v", err)
	}
	var emits []string
	err = LoadWithMethodOutputStopEvent(data, tc.args, "go", tc.stopEvent, func(s string) {
		emits = append(emits, s)
	})
	if err != nil {
		t.Fatalf("LoadWithMethodOutputStopEvent: %v", err)
	}
	joined := strings.Join(emits, "\n")
	for _, w := range tc.want {
		if !strings.Contains(joined, w) {
			t.Fatalf("output missing %q, got: %q", w, joined)
		}
	}
	for _, nw := range tc.notWant {
		if strings.Contains(joined, nw) {
			t.Fatalf("output unexpectedly contains %q: %q", nw, joined)
		}
	}
}

func TestResolvePlainExternalFunction(t *testing.T) {
	rt := &bofRuntime{output: make(chan interface{}, 8), stopEvent: 0x1234}
	addr := resolveSymbolAddress("BeaconOutput", rt)
	if addr == 0 {
		t.Fatal("resolveSymbolAddress(BeaconOutput) = 0")
	}
	addr2 := resolveSymbolAddress("BeaconPrintf", rt)
	if addr2 == 0 {
		t.Fatal("resolveSymbolAddress(BeaconPrintf) = 0")
	}
}

func TestCOFFLoaderEndToEnd(t *testing.T) {
	compilers := findCompilers()
	if len(compilers) == 0 {
		t.Skip("no C compiler (gcc/cl) available")
	}

	argBytes := PackArgs([]interface{}{
		int(42),
		[]byte{0x34, 0x12},
		[]byte("hello"),
	})

	cases := []bofCase{
		{name: "hello", src: "hello.c", want: []string{"hello-beacon", "printf-int=42 str=msg"}},
		{name: "args", src: "args.c", args: argBytes, want: []string{"int=42 short=4660 rem="}},
		{name: "globals", src: "globals.c", want: []string{"static=7 pstr=gstr", "static-after=49"}},
		// crash 用例：BOF 访问 0x0 触发访问冲突，验证 VEH 归属判断。
		// VEH 应捕获 BOF 线程异常并安全退出（输出 before-crash，无 after-crash），
		// 同时进程存活（Beacon 主线程异常不被吞掉）。
		{name: "crash", src: "crash.c", want: []string{"before-crash"}, notWant: []string{"after-crash"}},
		{name: "stopevent", src: "stopevent.c", stopEvent: 0x12345678,
			want: []string{"stop-event=12345678"}},
		{name: "nodll", src: "nodll.c", want: []string{"nodll-output"}},
	}

	for _, c := range compilers {
		c := c
		t.Run(c.name, func(t *testing.T) {
			for _, tc := range cases {
				tc := tc
				t.Run(tc.name, func(t *testing.T) {
					runBofCase(t, &c, tc)
				})
			}
		})
	}
}
