package mcp

import (
	"context"
	"sync"
	"testing"
	"time"
)

// ─── SessionState ───

func TestSessionCredentialsNotReadyByDefault(t *testing.T) {
	s := NewSessionState()
	if _, _, ready := s.Credentials(); ready {
		t.Fatal("fresh SessionState should not be ready")
	}
}

func TestSessionSetCredentials(t *testing.T) {
	s := NewSessionState()
	s.SetCredentials("", "tok-1") // apiBase 为空:保留默认,token 生效
	api, tok, ready := s.Credentials()
	if !ready || tok != "tok-1" {
		t.Fatalf("ready=%v token=%q", ready, tok)
	}
	if api != "" {
		t.Errorf("empty apiBase should be ignored, got %q", api)
	}
	s.SetCredentials("https://127.0.0.1:8080", "tok-2")
	api, tok, _ = s.Credentials()
	if api != "https://127.0.0.1:8080" || tok != "tok-2" {
		t.Fatalf("api=%q token=%q", api, tok)
	}
	if s.UpdatedAt().IsZero() {
		t.Error("UpdatedAt should be set after SetCredentials")
	}
}

func TestSessionConcurrentAccess(t *testing.T) {
	s := NewSessionState()
	var wg sync.WaitGroup
	for i := 0; i < 16; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			s.SetCredentials("https://h", "tok")
			s.Credentials()
			s.UpdatedAt()
		}(i)
	}
	wg.Wait()
}

// ─── normalizeFrame / extractType ───

func TestNormalizeFrameStripsMessageEnvelope(t *testing.T) {
	inner := `{"type":"BEACON_REGISTERED","beacon_id":"b1"}`
	rec := normalizeFrame(eventMessageName, map[string]string{"data": inner})
	if rec.Type != "BEACON_REGISTERED" {
		t.Fatalf("type = %q, want BEACON_REGISTERED", rec.Type)
	}
	obj, ok := rec.Payload.(map[string]any)
	if !ok || obj["beacon_id"] != "b1" {
		t.Fatalf("payload 应为内层解码对象: %#v", rec.Payload)
	}
}

func TestNormalizeFrameNonMessageTypeKeptAsIs(t *testing.T) {
	rec := normalizeFrame("teamserver:ws:status", map[string]any{"status": "open"})
	if rec.Type != "" {
		t.Fatalf("non-message frame should have no Type, got %q", rec.Type)
	}
	if rec.Name != "teamserver:ws:status" {
		t.Fatalf("name = %q", rec.Name)
	}
}

func TestNormalizeFrameInvalidInnerJSON(t *testing.T) {
	rec := normalizeFrame(eventMessageName, map[string]string{"data": "not-json"})
	if rec.Type != "" {
		t.Fatalf("invalid inner should have empty type, got %q", rec.Type)
	}
	if strVal, ok := rec.Payload.(string); !ok || strVal != "not-json" {
		t.Fatalf("非法内层应保留字符串形式: %#v", rec.Payload)
	}
}

func TestNormalizeFrameTypeKeyAliases(t *testing.T) {
	for _, key := range []string{"Type", "event_type", "eventType"} {
		rec := normalizeFrame(eventMessageName,
			map[string]string{"data": `{` + `"` + key + `":"X"` + `}`})
		if rec.Type != "X" {
			t.Errorf("alias %q not detected, got %q", key, rec.Type)
		}
	}
}

// ─── EventSink ───

func TestEventSinkFIFOAndWraparound(t *testing.T) {
	sink := NewEventSink(3)
	for i := 0; i < 5; i++ { // 超容量,只留最后 3 条
		sink.Emit(eventMessageName, map[string]string{
			"data": `{"type":"T","n":` + string(rune('0'+i)) + `}`,
		})
	}
	got := sink.List(Filter{})
	if len(got) != 3 {
		t.Fatalf("cap=3 sink after 5 emits should hold 3, got %d", len(got))
	}
	for i := 1; i < len(got); i++ {
		if got[i].Seq <= got[i-1].Seq {
			t.Fatalf("seq not ascending: %v", got)
		}
	}
	if last := got[len(got)-1]; last.Seq != 5 {
		t.Fatalf("last seq = %d, want 5", last.Seq)
	}
}

func TestEventSinkListFilterByPrefix(t *testing.T) {
	sink := NewEventSink(10)
	sink.Emit("teamserver:ws:message", map[string]string{"data": `{"type":"BEACON_TICK"}`})
	sink.Emit("teamserver:ws:message", map[string]string{"data": `{"type":"COMMAND_EVENT"}`})
	sink.Emit("teamserver:ws:status", map[string]string{})

	beacons := sink.List(Filter{TypePrefix: "BEACON"})
	if len(beacons) != 1 || beacons[0].Type != "BEACON_TICK" {
		t.Fatalf("prefix BEACON filter failed: %+v", beacons)
	}
	// 非 message 帧无 Type,按事件名回退匹配
	status := sink.List(Filter{TypePrefix: "teamserver:ws:s"})
	if len(status) != 1 {
		t.Fatalf("name-fallback filter failed: %+v", status)
	}
	all := sink.List(Filter{})
	if len(all) != 3 {
		t.Fatalf("no-filter should return all, got %d", len(all))
	}
}

func TestEventSinkListSinceSeq(t *testing.T) {
	sink := NewEventSink(10)
	for i := 0; i < 4; i++ {
		sink.Emit("evt", nil)
	}
	got := sink.List(Filter{SinceSeq: 2})
	if len(got) != 2 || got[0].Seq != 3 {
		t.Fatalf("since_seq=2 should yield seq 3,4: %+v", got)
	}
	if sink.LastSeq() != 4 {
		t.Fatalf("LastSeq = %d, want 4", sink.LastSeq())
	}
}

func TestEventSinkWaitHitsExisting(t *testing.T) {
	sink := NewEventSink(4)
	sink.Emit("teamserver:ws:message", map[string]string{"data": `{"type":"BEACON_REGISTERED"}`})

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	rec, err := sink.Wait(ctx, Filter{TypePrefix: "BEACON"}, time.Second)
	if err != nil || rec.Type != "BEACON_REGISTERED" {
		t.Fatalf("wait should hit existing event immediately: rec=%+v err=%v", rec, err)
	}
}

func TestEventSinkWaitBlocksThenHitsOnAppend(t *testing.T) {
	sink := NewEventSink(4)
	go func() {
		time.Sleep(50 * time.Millisecond)
		sink.Emit("teamserver:ws:message", map[string]string{"data": `{"type":"LATE"}`})
	}()
	rec, err := sink.Wait(context.Background(), Filter{TypePrefix: "LATE"}, 2*time.Second)
	if err != nil || rec.Type != "LATE" {
		t.Fatalf("wait miss: rec=%+v err=%v", rec, err)
	}
}

func TestEventSinkWaitTimeout(t *testing.T) {
	sink := NewEventSink(2)
	start := time.Now()
	_, err := sink.Wait(context.Background(), Filter{TypePrefix: "NOPE"}, 80*time.Millisecond)
	if err == nil {
		t.Fatal("expected timeout error")
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Fatalf("timeout took too long: %v", elapsed)
	}
}

func TestEventSinkWaitCtxCancel(t *testing.T) {
	sink := NewEventSink(2)
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(20 * time.Millisecond)
		cancel()
	}()
	if _, err := sink.Wait(ctx, Filter{TypePrefix: "X"}, 5*time.Second); err == nil {
		t.Fatal("expected ctx-cancelled error")
	}
}

func TestEventSinkConcurrentEmitListSeqUnique(t *testing.T) {
	sink := NewEventSink(64)
	const writers, per = 8, 50
	var wg sync.WaitGroup
	for w := 0; w < writers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < per; i++ {
				sink.Emit("e", nil)
			}
		}()
	}
	wg.Wait()
	if got := sink.LastSeq(); got != writers*per {
		t.Fatalf("LastSeq = %d, want %d (序号必须不重不漏)", got, writers*per)
	}
}
