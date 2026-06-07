package jobs

import (
	"strings"
	"testing"
	"time"
)

func TestManagerListAndKill(t *testing.T) {
	m := NewManager()
	defer m.Close()

	job, err := m.Create(1234, 10, TypeProcess, "shell")
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	m.Start(job, func(job *Job) {
		<-job.Context().Done()
	})

	list := m.List()
	if !strings.Contains(list, "1234") || !strings.Contains(list, "shell") {
		t.Fatalf("job list missing expected row: %s", list)
	}

	msg, ok := m.RequestKill(1234)
	if !ok || !strings.Contains(msg, "kill requested") {
		t.Fatalf("unexpected kill result: ok=%v msg=%q", ok, msg)
	}

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if m.List() == "No active jobs" {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("job did not complete after kill: %s", m.List())
}

func TestCancelHookRuns(t *testing.T) {
	m := NewManager()
	defer m.Close()

	job, err := m.Create(4321, 70, TypeBOF, "bof")
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	called := make(chan struct{}, 1)
	job.SetCancelHook(func() {
		called <- struct{}{}
	})
	m.Start(job, func(job *Job) {
		<-job.Context().Done()
	})

	if _, ok := m.RequestKill(4321); !ok {
		t.Fatal("RequestKill failed")
	}

	select {
	case <-called:
	case <-time.After(time.Second):
		t.Fatal("cancel hook was not called")
	}
}
