package command

import (
	"beacon/pkg/utils/packet"
	"os"
	"strings"
	"testing"
)

func TestDownloadEmptyFileEmitsOneEmptyChunk(t *testing.T) {
	resetTransferState()

	path := tempFile(t, nil)
	payload, err := packet.PackArray([]any{"dl-empty", path, int32(0), int32(1)})
	if err != nil {
		t.Fatalf("pack download request: %v", err)
	}

	results, err := Download(packet.CreateParser(payload), 77, 65001)
	if err != nil {
		t.Fatalf("Download failed: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected one chunk, got %d", len(results))
	}

	_, commandID, body := parseFinalPacket(t, results[0])
	if commandID != CommandDownload {
		t.Fatalf("unexpected command id: %d", commandID)
	}
	chunk := parseFileChunk(t, body)
	if chunk.TaskID != "dl-empty" || chunk.ChunkIndex != 0 || chunk.TotalChunks != 1 || len(chunk.Data) != 0 {
		t.Fatalf("unexpected chunk: %+v", chunk)
	}
	if len(downloadStates) != 0 {
		t.Fatalf("download state should be removed after empty file completion")
	}
}

func TestUploadRejectsOutOfOrderFirstChunkWithoutStateLeak(t *testing.T) {
	resetTransferState()

	path := tempFile(t, nil)
	payload := packUploadPayload(t, path, "up1", "file1", 1, 2, []byte("late"))
	ackBytes, err := Upload(packet.CreateParser(payload), 88, 65001)
	if err != nil {
		t.Fatalf("Upload failed: %v", err)
	}

	ack := parseUploadAck(t, ackBytes)
	if ack.OK || !strings.Contains(ack.ErrorMessage, "missing initial chunk") {
		t.Fatalf("unexpected ack: %+v", ack)
	}
	if len(uploadStates) != 0 {
		t.Fatalf("upload state leaked after invalid first chunk")
	}
}

func TestUploadDuplicateChunkDoesNotAdvanceReceivedCount(t *testing.T) {
	resetTransferState()

	path := tempFile(t, nil)
	payload := packUploadPayload(t, path, "up2", "file2", 0, 2, []byte("abc"))
	if _, err := Upload(packet.CreateParser(payload), 89, 65001); err != nil {
		t.Fatalf("first Upload failed: %v", err)
	}
	if uploadStates["up2"].ReceivedChunks != 1 {
		t.Fatalf("expected one received chunk, got %d", uploadStates["up2"].ReceivedChunks)
	}

	ackBytes, err := Upload(packet.CreateParser(payload), 89, 65001)
	if err != nil {
		t.Fatalf("duplicate Upload failed: %v", err)
	}
	ack := parseUploadAck(t, ackBytes)
	if !ack.OK || ack.WrittenBytes != 3 {
		t.Fatalf("unexpected duplicate ack: %+v", ack)
	}
	if uploadStates["up2"].ReceivedChunks != 1 {
		t.Fatalf("duplicate chunk advanced received count")
	}
}

func resetTransferState() {
	downloadMu.Lock()
	downloadStates = make(map[string]*DownloadState)
	downloadMu.Unlock()
	uploadMu.Lock()
	uploadStates = make(map[string]*UploadState)
	uploadMu.Unlock()
}

func tempFile(t *testing.T, data []byte) string {
	t.Helper()

	f, err := os.CreateTemp("", "beacon-transfer-*")
	if err != nil {
		t.Fatalf("create temp file: %v", err)
	}
	if len(data) > 0 {
		if _, err := f.Write(data); err != nil {
			t.Fatalf("write temp file: %v", err)
		}
	}
	if err := f.Close(); err != nil {
		t.Fatalf("close temp file: %v", err)
	}
	t.Cleanup(func() { _ = os.Remove(f.Name()) })
	return f.Name()
}

func packUploadPayload(t *testing.T, remotePath, taskID, fileID string, chunkIndex, totalChunks int, data []byte) []byte {
	t.Helper()
	payload, err := packet.PackArray([]any{
		remotePath,
		taskID,
		fileID,
		int32(chunkIndex),
		int32(totalChunks),
		packet.PackBytes(data),
	})
	if err != nil {
		t.Fatalf("pack upload payload: %v", err)
	}
	return payload
}

func parseFinalPacket(t *testing.T, final []byte) (uint32, uint32, []byte) {
	t.Helper()
	outer := packet.CreateParser(final)
	block := outer.ParseBytes()
	if outer.HasError() {
		t.Fatalf("parse final outer: %v", outer.Error())
	}
	inner := packet.CreateParser(block)
	taskID := inner.ParseInt32()
	commandID := inner.ParseInt32()
	body := inner.ParseBytes()
	if inner.HasError() {
		t.Fatalf("parse final inner: %v", inner.Error())
	}
	return taskID, commandID, body
}

func parseFileChunk(t *testing.T, body []byte) FileChunk {
	t.Helper()
	p := packet.CreateParser(body)
	chunk := FileChunk{
		TaskID:      p.ParseString(),
		FileID:      p.ParseString(),
		ChunkIndex:  int(p.ParseInt32()),
		TotalChunks: int(p.ParseInt32()),
		Data:        p.ParseBytes(),
	}
	if p.HasError() {
		t.Fatalf("parse file chunk: %v", p.Error())
	}
	return chunk
}

func parseUploadAck(t *testing.T, body []byte) UploadAck {
	t.Helper()
	p := packet.CreateParser(body)
	ack := UploadAck{
		TransferTaskID: p.ParseString(),
		FileID:         p.ParseString(),
		ChunkIndex:     int(p.ParseInt32()),
		WrittenBytes:   int(p.ParseInt32()),
		OK:             p.ParseBool(),
		ErrorMessage:   p.ParseString(),
	}
	if p.HasError() {
		t.Fatalf("parse upload ack: %v", p.Error())
	}
	return ack
}
