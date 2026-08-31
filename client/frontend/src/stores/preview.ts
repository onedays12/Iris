/**
 * 文件预览 Store
 *
 * 状态机: idle → creating(创建任务) → receiving(等待/拉取内容) → ready | failed
 *
 * - openPreview: 入口预判(类型白名单 + 2MB 上限) → 创建预览任务 → 弹窗进入「预览中…」
 * - handlePreviewEvent: 由 commandEventHandler 收到 phase=preview 事件后调用
 *   (ready → 拉取内容; failed → 按 reason 提示)
 * - close: 释放 server 内存(DELETE, fire-and-forget)并复位
 * - 单例: 打开新预览前自动释放旧预览
 */

import { defineStore } from 'pinia'
import { i18n } from '../i18n/index'
import { useNotificationStore } from './notification'
import {
  createPreview,
  fetchPreviewImageBase64,
  fetchPreviewText,
  releasePreview,
} from '../features/preview/api'
import {
  getPreviewKind,
  isPreviewTooLarge,
  type PreviewKind,
} from '../features/preview/model'

export type PreviewStatus = 'idle' | 'creating' | 'receiving' | 'ready' | 'failed'

interface PreviewState {
  visible: boolean
  status: PreviewStatus
  previewId: string
  beaconId: string
  remotePath: string
  fileName: string
  kind: PreviewKind | ''
  mime: string
  /** 文本内容或图片 data URL */
  content: string
  size: number
  errorMessage: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

const IDLE_STATE: PreviewState = {
  visible: false,
  status: 'idle',
  previewId: '',
  beaconId: '',
  remotePath: '',
  fileName: '',
  kind: '',
  mime: '',
  content: '',
  size: 0,
  errorMessage: '',
}

export const usePreviewStore = defineStore('preview', {
  state: (): PreviewState => ({ ...IDLE_STATE }),

  getters: {
    /** 内容尚未就绪（创建中 / 等待回传 / 拉取中） */
    isLoading(state): boolean {
      return state.status === 'creating' || state.status === 'receiving'
    },
    /** 是否处于失败态且无内容可看 */
    hasError(state): boolean {
      return state.status === 'failed'
    },
  },

  actions: {
    /** 复位为初始状态（不触发释放）。 */
    reset(): void {
      Object.assign(this, { ...IDLE_STATE })
    },

    /** 释放 server 内存（fire-and-forget，TTL 兜底）。 */
    releaseQuietly(): void {
      const previewId = this.previewId
      if (!previewId) return
      releasePreview(previewId).catch(() => {
        // 释放失败不影响 UI，TTL 5 分钟会自动清理
      })
    },

    /**
     * 打开预览：预判类型与大小后创建预览任务。
     * 不支持的类型 / 超限文件直接提示，不发起请求。
     */
    async openPreview(beaconId: string, path: string, fileName: string, size: number): Promise<void> {
      const t = i18n.global.t
      const kind = getPreviewKind(fileName)
      if (!kind) {
        useNotificationStore().warn(t('preview.unsupported'))
        return
      }
      if (isPreviewTooLarge(size)) {
        useNotificationStore().warn(t('preview.tooLargeHint'))
        return
      }

      // 单例：打开新预览前释放旧的
      if (this.visible && this.previewId) {
        this.releaseQuietly()
      }
      this.reset()
      this.visible = true
      this.status = 'creating'
      this.beaconId = String(beaconId || '')
      this.remotePath = String(path || '')
      this.fileName = String(fileName || '')
      this.kind = kind
      this.size = Number(size) || 0

      try {
        const view = await createPreview(String(beaconId), String(path))
        this.previewId = view.previewId
        if (view.kind) this.kind = view.kind
        if (view.mime) this.mime = view.mime
        this.status = 'receiving'
      } catch (err) {
        this.status = 'failed'
        this.errorMessage = err instanceof Error ? err.message : String(err)
      }
    },

    /**
     * 处理 phase=preview 的 WS 事件（由 commandEventHandler 分发）。
     * preview_id 与当前活跃预览不一致时忽略（迟到事件）。
     */
    async handlePreviewEvent(payload: unknown): Promise<void> {
      const record = asRecord(payload)
      const previewId = String(record.preview_id || '')
      if (!previewId || previewId !== this.previewId) return

      const status = String(record.status || '').toLowerCase()
      const t = i18n.global.t

      if (status === 'ready') {
        this.status = 'receiving'
        try {
          if (this.kind === 'image') {
            const base64 = await fetchPreviewImageBase64(previewId)
            const mime = String(record.mime || this.mime || 'image/png')
            this.content = `data:${mime};base64,${base64}`
          } else {
            this.content = await fetchPreviewText(previewId)
          }
          this.mime = String(record.mime || this.mime || '')
          this.status = 'ready'
        } catch (err) {
          this.status = 'failed'
          this.errorMessage = err instanceof Error ? err.message : String(err)
        }
        return
      }

      if (status === 'failed') {
        const reason = String(record.reason || '')
        if (reason === 'too_large') {
          useNotificationStore().warn(t('preview.tooLarge'))
          this.errorMessage = t('preview.tooLarge')
        } else {
          useNotificationStore().error(t('preview.readError'))
          this.errorMessage = t('preview.readError')
        }
        this.status = 'failed'
      }
    },

    /** 关闭预览窗口并释放 server 内存。 */
    close(): void {
      this.releaseQuietly()
      this.reset()
    },
  },
})
