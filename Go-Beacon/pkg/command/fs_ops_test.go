package command

import (
	"os"
	"testing"
)

func TestUnixFileMode(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		raw  uint32
		want os.FileMode
	}{
		{name: "new frontend 644 bits", raw: 420, want: 0o644},
		{name: "new frontend 755 bits", raw: 493, want: 0o755},
		{name: "new frontend 777 bits", raw: 0o777, want: 0o777},
		{name: "legacy decimal 644", raw: 644, want: 0o644},
		{name: "legacy decimal 755", raw: 755, want: 0o755},
		{name: "zero", raw: 0, want: 0},
		{name: "invalid octal digit", raw: 888, want: os.FileMode(888) & 0o7777},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := unixFileMode(tc.raw)
			if got != tc.want {
				t.Fatalf("unixFileMode(%d) = %04o, want %04o", tc.raw, got, tc.want)
			}
		})
	}
}
