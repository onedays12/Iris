import { beforeEach, describe, expect, it, vi } from 'vitest'

const httpMocks = vi.hoisted(() => ({
  request: vi.fn(),
  uploadFileBase64: vi.fn(),
  downloadBinaryBase64: vi.fn(),
}))

vi.mock('../../../src/shared/api/httpClient.js', () => httpMocks)

import * as fileApi from '../../../src/features/files/api/fileApi'
import * as payloadApi from '../../../src/features/payload/api/payloadApi'
import * as screenshotApi from '../../../src/features/screenshots/api/screenshotApi'

describe('file, screenshot, and payload API contracts', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('creates explorer tasks and lists/downloads stored files', async () => {
    const stored = { file_id: 'f1', file_name: 'a.bin' }
    httpMocks.request.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce([stored])
    httpMocks.downloadBinaryBase64.mockResolvedValue('AA==')

    await fileApi.explorerFiles('b1', 'C:\\Windows', 1000, 0)
    expect(httpMocks.request).toHaveBeenNthCalledWith(1, 'POST', '/api/v1/explorer/files', {
      beacon_id: 'b1', path: 'C:\\Windows', limit: 1000, offset: 0,
    })
    await expect(fileApi.listDownloads()).resolves.toMatchObject([{ fileId: 'f1', fileName: 'a.bin' }])
    await expect(fileApi.downloadFileBase64({ fileId: 'f 1' })).resolves.toBe('AA==')
    expect(httpMocks.downloadBinaryBase64).toHaveBeenCalledWith('/api/v1/files/downloads/f%201')
  })

  it('uploads a File through the Wails base64 transport', async () => {
    httpMocks.uploadFileBase64.mockResolvedValue({ file_id: 'f1', file_name: 'a.txt' })
    const file = new File(['abc'], 'a.txt', { type: 'text/plain' })
    await expect(fileApi.uploadFile(file)).resolves.toMatchObject({ fileId: 'f1', fileName: 'a.txt' })
    expect(httpMocks.uploadFileBase64).toHaveBeenCalledWith('/api/v1/files/uploads', 'a.txt', 'YWJj')
  })

  it('covers screenshot list, command, download, and delete paths', async () => {
    const shot = { screenshot_id: 's1' }
    httpMocks.request
      .mockResolvedValueOnce([shot])
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true })
    httpMocks.downloadBinaryBase64.mockResolvedValue('jpeg')

    await expect(screenshotApi.listScreenshots()).resolves.toEqual([shot])
    await screenshotApi.requestScreenshot('b1', 1, 75)
    expect(httpMocks.request).toHaveBeenNthCalledWith(2, 'POST', '/api/v1/beacon/command', {
      beacon_id: 'b1',
      command: 51,
      args: [{ kind: 'int32', value: 1 }, { kind: 'int32', value: 75 }],
    })
    await screenshotApi.downloadScreenshotBase64({ screenshotId: 's 1' })
    expect(httpMocks.downloadBinaryBase64).toHaveBeenCalledWith('/api/v1/screenshot/download?screenshot_id=s%201')
    await screenshotApi.deleteScreenshot('s 1')
    expect(httpMocks.request).toHaveBeenNthCalledWith(3, 'DELETE', '/api/v1/screenshot?screenshot_id=s%201')
  })

  it('accepts arm64 and native Unix formats and omits irrelevant shellcode loader fields', async () => {
    httpMocks.request
      .mockResolvedValueOnce({ payload: 'AA==', encoding: 'base64', format: 'exe', stage_mode: 'stagerless' })
      .mockResolvedValueOnce({ payload: 'AA==', encoding: 'base64', format: 'macho', stage_mode: 'stagerless' })
      .mockResolvedValueOnce({ shellcode: 'AA==', encoding: 'base64', mode: 'front', size: 1 })

    await payloadApi.generatePayload({
      listener_id: 'http-1', os: 'linux', arch: 'arm64', format: 'exe', beacon_type: 'go',
    })
    expect(httpMocks.request).toHaveBeenNthCalledWith(1, 'POST', '/api/v1/payload/generate', {
      listener_id: 'http-1', os: 'linux', arch: 'arm64', format: 'exe', stage_mode: 'stagerless', beacon_type: 'go',
    })

    await payloadApi.generatePayload({
      listener_id: 'http-1', os: 'mac', arch: 'arm', format: 'macho', beacon_type: 'go',
    })

    await payloadApi.generateShellcode({ mode: 'front', pe_base64: 'PE' })
    expect(httpMocks.request).toHaveBeenNthCalledWith(3, 'POST', '/api/v1/payload/shellcode', {
      mode: 'front', pe_base64: 'PE',
    })
  })
})
