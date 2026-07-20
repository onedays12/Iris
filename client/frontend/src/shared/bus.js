/**
 * 轻量事件总线 —— 解除 store 间循环依赖。
 *
 * 设计要点:
 * - 同步 emit:保证订阅者按注册顺序同步执行,时序与直接调用一致(如 openConsole
 *   必须先于 appendToConsole)。无 async 派发,避免微任务乱序。
 * - on 返回 unsubscribe 函数:方便测试清理与动态订阅。
 * - 单例 bus:全应用共享一个 emitter,store 在 initSubscriptions 时注册。
 *
 * 用法:
 *   import { bus } from './bus.js'
 *   const off = bus.on('agent:removed', ({ beaconid }) => { ... })
 *   bus.emit('agent:removed', { beaconid: 'abc' })
 *   off()  // 取消订阅
 */

class Emitter {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.handlers = new Map()
  }

  /**
   * 订阅事件
   * @param {string} event 事件名
   * @param {Function} handler 处理函数
   * @returns {Function} 取消订阅函数(调用即移除该 handler)
   */
  on(event, handler) {
    if (typeof handler !== 'function') return () => {}
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    set.add(handler)
    return () => this.off(event, handler)
  }

  /**
   * 取消订阅(显式调用,通常用 on 返回的 off 函数更方便)
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    const set = this.handlers.get(event)
    if (set) {
      set.delete(handler)
      if (set.size === 0) this.handlers.delete(event)
    }
  }

  /**
   * 同步派发事件
   * @param {string} event 事件名
   * @param {*} payload 载荷(任意类型,通常为对象)
   */
  emit(event, payload) {
    const set = this.handlers.get(event)
    if (!set || set.size === 0) return
    // 复制一份,避免订阅者在派发过程中增删导致迭代异常
    for (const handler of [...set]) {
      try {
        handler(payload)
      } catch (err) {
        // 单个订阅者抛错不影响其他订阅者与调用方
        console.error(`[bus] handler for "${event}" threw:`, err)
      }
    }
  }

  /**
   * 清空所有订阅(仅测试用,生产勿调)
   */
  clear() {
    this.handlers.clear()
  }
}

/** 全局事件总线单例 */
export const bus = new Emitter()
