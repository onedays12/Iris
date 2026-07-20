package tls

import (
	"testing"
)

// TestParseTLSSkipVerify 覆盖环境变量解析的所有分支。
// 直接测 ParseTLSSkipVerify 纯函数,避免 sync.Once 不可重置的全局状态污染。
func TestParseTLSSkipVerify(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want bool
	}{
		{"empty defaults to true (兼容现状)", "", true},
		{"false", "false", false},
		{"FALSE case insensitive", "FALSE", false},
		{"0", "0", false},
		{"no", "no", false},
		{"off", "off", false},
		{"  false  with spaces", "  false  ", false},
		{"true", "true", true},
		{"yes", "yes", true},
		{"1", "1", true},
		{"anything else defaults to true", "maybe", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := ParseTLSSkipVerify(tc.raw); got != tc.want {
				t.Errorf("ParseTLSSkipVerify(%q) = %v, want %v", tc.raw, got, tc.want)
			}
		})
	}
}

// TestNewTLSConfigNotNil 验证 NewTLSConfig 返回有效配置。
// 不硬断言 InsecureSkipVerify 的具体值(受环境变量 + sync.Once 影响),
// 只保证返回非 nil 配置可被 transport/dialer 使用。
func TestNewTLSConfigNotNil(t *testing.T) {
	cfg := NewTLSConfig()
	if cfg == nil {
		t.Fatal("NewTLSConfig returned nil")
	}
}
