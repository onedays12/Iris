/**
 * 轻量事件总线 —— 解除 store 间循环依赖。
 *
 * 设计要点:
 * - 同步 emit:保证订阅者按注册顺序同步执行,时序与直接调用一致(如 openConsole
 *   必须先于 appendToConsole)。无 async 派发,避免微任务乱序。
 * - on 返回 unsubscribe 函数:方便测试清理与动态订阅。
 * - 单例 bus:全应用共享一个 emitter,store 在 initSubscriptions 时注册。
 */

import type {
  BeaconRegisteredEventData,
  EventRecord,
  ListenerStateChangedEventData,
} from '../features/events/types'

export interface WsEventRecordPayload {
  rawType: string
  type: string
  data: EventRecord
  raw: EventRecord
  commandId: string | number
  phase: string
  status: string
  resultType: string
}

export interface AppEvents {
  'agent:removed': { beaconid: string }
  'agent:registered': { beaconid: string; os: string }
  'agent:os-changed': { beaconid: string; os: string }
  'agent:update-sleep': { beaconid: string; sleep: number; jitter: number }
  'ws:beacon-registered': { data: BeaconRegisteredEventData }
  'ws:beacon-tick': { beaconid: string; lastSeen: string; status: string }
  'ws:beacon-removed': { beaconid: string }
  'ws:connected': { reconnected: boolean }
  'ws:listener-changed': { data: ListenerStateChangedEventData }
  'ws:event-record': WsEventRecordPayload
}

type EventPayload<K extends string> = K extends keyof AppEvents ? AppEvents[K] : unknown
type Handler = (payload: unknown) => void

class Emitter {
  private handlers = new Map<string, Set<Handler>>()

  on<K extends string>(event: K, handler: (payload: EventPayload<K>) => void): () => void
  on(event: string, handler: unknown): () => void {
    if (typeof handler !== 'function') return () => {}
    const typed = handler as Handler
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    set.add(typed)
    return () => this.off(event, typed)
  }

  off(event: string, handler: (...args: never[]) => void): void {
    const set = this.handlers.get(event)
    if (set) {
      set.delete(handler as Handler)
      if (set.size === 0) this.handlers.delete(event)
    }
  }

  emit<const K extends string>(event: K, payload: NoInfer<EventPayload<K>>): void
  emit(event: string, payload?: unknown): void {
    const set = this.handlers.get(event)
    if (!set || set.size === 0) return
    for (const handler of [...set]) {
      try {
        handler(payload)
      } catch (err) {
        console.error(`[bus] handler for "${event}" threw:`, err)
      }
    }
  }

  clear(): void {
    this.handlers.clear()
  }
}

export const bus = new Emitter()
