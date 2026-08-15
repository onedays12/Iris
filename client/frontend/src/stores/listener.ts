/**
 * 监听器管理 Store
 * 负责监听器列表的加载、创建、删除等 CRUD 操作。
 */

import { defineStore } from 'pinia'
import * as listenerApi from '../features/listener/api/listenerApi'
import { mergeListener, normalizeListener, sameListener } from '../features/listener/model'
import { bus } from '../shared/bus'
import type { ListenerCreateRequest, ListenerEditRequest } from '../features/listener/api/types'
import type { Listener } from '../features/listener/model'

interface ListenerState {
  listeners: Listener[]
  loading: boolean
  _subscribed: boolean
}

export const useListenerStore = defineStore('listener', {
  state: (): ListenerState => ({
    listeners: [],
    loading: false,
    _subscribed: false,
  }),

  getters: {
    /** 获取运行中的监听器 */
    runningListeners: (state) => state.listeners.filter(l => l.status === 'started'),
  },

  actions: {
    /** 获取最新的监听器列表 */
    async fetchListeners(): Promise<void> {
      this.loading = true
      try {
        const data = await listenerApi.listListeners()
        this.listeners = Array.isArray(data) ? data.map(normalizeListener) : []
      } catch (err) {
        console.error('获取监听器列表失败:', err)
      } finally {
        this.loading = false
      }
    },

    /** 根据 LISTENER_STATE_CHANGED 增量合并监听器状态 */
    upsertListener(payload: unknown): void {
      if (!payload || typeof payload !== 'object') return
      const next = normalizeListener(payload)
      if (!next.name && !next.id) return

      if (next.status === 'removed' || next.status === 'deleted') {
        this.listeners = this.listeners.filter(item => !sameListener(item, next))
        return
      }

      const index = this.listeners.findIndex(item => sameListener(item, next))

      if (index >= 0) {
        this.listeners.splice(index, 1, mergeListener(this.listeners[index], next))
      } else {
        this.listeners.unshift(next)
      }
    },

    /** 创建监听器 */
    async createListener(config: ListenerCreateRequest): Promise<Listener | undefined> {
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
    async deleteListener(name: string): Promise<void> {
      try {
        await listenerApi.removeListener(name)
        this.listeners = this.listeners.filter(l => l.name !== name)
      } catch (err) {
        console.error('删除监听器失败:', err)
        throw err
      }
    },

    /** 启动 (Resume) 监听器 */
    async startListener(name: string): Promise<void> {
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
    async stopListener(name: string): Promise<void> {
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
    async updateListener(payload: ListenerEditRequest): Promise<Listener | undefined> {
      try {
        await listenerApi.editListener(payload)
        await this.fetchListeners()
        return this.listeners.find(l => l.name === payload.name)
      } catch (err) {
        console.error('更新监听器失败:', err)
        throw err
      }
    },

    /**
     * 初始化事件总线订阅(解除 wsEventRouter→listener 硬依赖)。
     * 幂等:用 _subscribed flag 去重。App.vue 启动时调用。
     */
    initSubscriptions(): void {
      if (this._subscribed) return
      this._subscribed = true

      // 来自 wsEventRouter 的 LISTENER_STATE_CHANGED(原 await import listenerStore)
      bus.on('ws:listener-changed', ({ data }) => {
        this.upsertListener(data)
      })
    },
  },
})
