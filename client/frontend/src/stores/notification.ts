/**
 * 通知管理 Store
 * 管理全局通知消息队列，支持自动销毁。
 */

import { defineStore } from 'pinia'

export type NotificationType = 'success' | 'error' | 'warn' | 'info'

export interface AppNotification {
  id: number
  message: string
  type: NotificationType
  duration: number
}

interface NotificationState {
  notifications: AppNotification[]
}

// ─── Store 定义 ───

export const useNotificationStore = defineStore('notification', {

  // ─── 状态 ───

  state: (): NotificationState => ({
    notifications: [],
  }),

  actions: {
    /**
     * 显示通知
     * @param message 通知内容
     * @param type 通知类型
     * @param duration 自动销毁时间 (ms)
     */
    add(message: string, type: NotificationType = 'info', duration = 3000): void {
      const id = Date.now()
      this.notifications.push({ id, message, type, duration })

      // 自动销毁
      if (duration > 0) {
        setTimeout(() => {
          this.remove(id)
        }, duration)
      }
    },

    success(message: string): void { this.add(message, 'success') },
    error(message: string): void { this.add(message, 'error', 5000) },
    warn(message: string): void { this.add(message, 'warn', 4000) },
    warning(message: string): void { this.add(message, 'warn', 4000) },
    info(message: string): void { this.add(message, 'info') },

    remove(id: number): void {
      this.notifications = this.notifications.filter(n => n.id !== id)
    }
  }
})
