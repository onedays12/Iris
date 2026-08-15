/**
 * 按 key 隔离的「加载锁 + 超时兜底」原语。
 *
 * processBrowser / networkBrowser 等按 beaconid 维护加载状态的 store 共用此逻辑,
 * 避免每个浏览器 store 各自重实现 loading 标志 + 定时器 + 超时错误文案。
 *
 * explorer 的路径级加载锁 (per-beacon 多路径并发) 语义不同, 不在此复用。
 */

export interface LoadingState {
  loading: Record<string, boolean>
  errorMessages: Record<string, string>
  timers: Record<string, ReturnType<typeof setTimeout>>
}

/**
 * 设置某 key 的加载状态。
 * - status=true: 标记加载中并挂超时定时器, 超时后自动解除并写入 errorMessage;
 * - status=false: 解除加载态并清掉挂起的超时定时器。
 */
export function setLoadingWithTimeout(
  state: LoadingState,
  key: string,
  status: boolean,
  timeoutMessage: string,
  timeoutMs: number,
): void {
  clearLoadingTimer(state, key)

  state.loading[key] = status
  if (!status) return

  state.timers[key] = setTimeout(() => {
    state.loading[key] = false
    state.errorMessages[key] = timeoutMessage
    delete state.timers[key]
  }, timeoutMs)
}

/**
 * 清理某 key 的挂起超时定时器 (不改变 loading 状态本身, 供 clear 类操作调用)。
 */
export function clearLoadingTimer(state: LoadingState, key: string): void {
  const timer = state.timers[key]
  if (timer) {
    clearTimeout(timer)
    delete state.timers[key]
  }
}
