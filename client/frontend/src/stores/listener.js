/**
 * 监听器管理 Store
 * 负责监听器列表的加载、创建、删除等 CRUD 操作。
 */

import { defineStore } from 'pinia'
import * as listenerApi from '../features/listener/api/listenerApi.js'

export const useListenerStore = defineStore('listener', {
  state: () => ({
    /** @type {Array<{id: string, name: string, protocol: string, status: string, created_at: string, config: string}>} */
    listeners: [],
    loading: false
  }),

  getters: {
    /** 获取运行中的监听器 */
    runningListeners: (state) => state.listeners.filter(l => l.status === 'started'),
  },

  actions: {
    /** 获取最新的监听器列表 */
    async fetchListeners() {
      this.loading = true
      try {
        const data = await listenerApi.listListeners()
        this.listeners = data || []
      } catch (err) {
        console.error('获取监听器列表失败:', err)
      } finally {
        this.loading = false
      }
    },

    /** 根据 LISTENER_STATE_CHANGED 增量合并监听器状态 */
    upsertListener(payload) {
      if (!payload || typeof payload !== 'object') return
      const name = String(payload.name || payload.Name || '').trim()
      const id = String(payload.id || payload.ID || '').trim()
      const status = String(payload.status || payload.Status || '').trim().toLowerCase()
      if (!name && !id) return

      if (status === 'removed' || status === 'deleted') {
        this.listeners = this.listeners.filter(item => {
          const itemName = String(item.name || item.Name || '').trim()
          const itemId = String(item.id || item.ID || '').trim()
          return !((name && itemName === name) || (id && itemId === id))
        })
        return
      }

      const index = this.listeners.findIndex(item => {
        const itemName = String(item.name || item.Name || '').trim()
        const itemId = String(item.id || item.ID || '').trim()
        return (name && itemName === name) || (id && itemId === id)
      })

      if (index >= 0) {
        this.listeners.splice(index, 1, {
          ...this.listeners[index],
          ...payload,
        })
      } else {
        this.listeners.unshift(payload)
      }
    },

    /** 创建监听器 */
    async createListener(config) {
      try {
        await listenerApi.createListener(config)
        // 重新拉取列表并返回新创建的对象
        await this.fetchListeners()
        // 根据名称（唯一）找到刚才创建的那个
        return this.listeners.find(l => l.name === config.name)
      } catch (err) {
        console.error('创建监听器失败:', err)
        throw err
      }
    },

    /** 删除监听器 */
    async deleteListener(name) {
      try {
        await listenerApi.removeListener(name)
        this.listeners = this.listeners.filter(l => l.name !== name)
      } catch (err) {
        console.error('删除监听器失败:', err)
        throw err
      }
    },

    /** 启动 (Resume) 监听器 */
    async startListener(name) {
      try {
        await listenerApi.resumeListener(name)
        const listener = this.listeners.find(l => l.name === name)
        if (listener) listener.status = 'started'
      } catch (err) {
        console.error('启动监听器失败:', err)
        throw err
      }
    },

    /** 暂停 (Pause) 监听器 */
    async stopListener(name) {
      try {
        await listenerApi.pauseListener(name)
        const listener = this.listeners.find(l => l.name === name)
        if (listener) listener.status = 'paused'
      } catch (err) {
        console.error('停止监听器失败:', err)
        throw err
      }
    },

    /** 更新监听器配置 (Edit) */
    async updateListener(payload) {
      try {
        await listenerApi.editListener(payload)
        await this.fetchListeners()
        return this.listeners.find(l => l.name === payload.name)
      } catch (err) {
        console.error('更新监听器失败:', err)
        throw err
      }
    },
  },
})
