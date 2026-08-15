<script setup lang="ts">
import { watch, computed, onErrorCaptured } from 'vue'
import { useRoute } from 'vue-router'
import router from './router/index'
import { useAuthStore } from './stores/auth'
import { useWSStore } from './stores/ws'
import { useListenerStore } from './stores/listener'
import { useAgentStore } from './stores/agent'
import { usePluginStore } from './stores/plugin'
import { useThemeStore } from './stores/theme'
import { useConsoleStore } from './stores/console'
import { useExplorerStore } from './stores/explorer'
import { useEventPanelStore } from './stores/eventPanel'
import { useFileTransferStore } from './stores/fileTransfer'
import { useTunnelStore } from './stores/tunnel'
import { useProcessBrowserStore } from './stores/processBrowser'
import { useNetworkBrowserStore } from './stores/networkBrowser'
import { useModalStore } from './stores/modal'
import { useLocaleStore } from './stores/locale'
import { useNotificationStore } from './stores/notification'
import { bus } from './shared/bus'
import Sidebar from './components/layout/Sidebar.vue'
import ToastContainer from './components/common/ToastContainer.vue'
import EventPanel from './components/common/EventPanel.vue'
import GlobalModalHost from './components/app/GlobalModalHost.vue'
import GlobalConsoleDock from './components/app/GlobalConsoleDock.vue'

const authStore = useAuthStore()
const wsStore = useWSStore()
const listenerStore = useListenerStore()
const agentStore = useAgentStore()
const pluginStore = usePluginStore()
const themeStore = useThemeStore()
const notificationStore = useNotificationStore()
const route = useRoute()

themeStore.initTheme()

// 初始化事件总线订阅(必须在 wsStore.connect 之前,保证 WS 消息到达时订阅已注册)。
// 各 store 的 initSubscriptions 幂等,重复调用不重复注册。
const consoleStore = useConsoleStore()
const explorerStore = useExplorerStore()
const eventPanelStore = useEventPanelStore()
const fileTransferStore = useFileTransferStore()
const tunnelStore = useTunnelStore()
const processBrowserStore = useProcessBrowserStore()
const networkBrowserStore = useNetworkBrowserStore()
const modalStore = useModalStore()
const localeStore = useLocaleStore()
agentStore.initSubscriptions()
consoleStore.initSubscriptions()
explorerStore.initSubscriptions()
listenerStore.initSubscriptions()
eventPanelStore.initSubscriptions()
fileTransferStore.initSubscriptions()
tunnelStore.initSubscriptions()
processBrowserStore.initSubscriptions()
networkBrowserStore.initSubscriptions()
modalStore.initSubscriptions()
bus.on('ws:connected', () => {
  listenerStore.fetchListeners().catch(() => {})
  agentStore.fetchAgents().catch(() => {})
  pluginStore.fetchPlugins().catch(() => {})
  tunnelStore.fetchTunnels({ silent: true }).catch(() => {})
})

// 初始化语言(懒加载消息文件; main.js 已同步设置首帧 locale)
localeStore.initLocale().catch(err => {
  console.warn('[Locale] 语言初始化失败, 使用回退语言:', err)
})

watch(() => authStore.token, async (newToken) => {
  if (newToken) {
    // 1. 建立长连接
    wsStore.connect()

    // 2. 等 WS 握手成功；ws:connected 统一负责首次连接和重连后的全量加载。
    try {
      await wsStore.waitForConnection()
    } catch {
      // WS 连接失败:不预加载,用户操作时各 store 自行重试
    }
  } else {
    wsStore.disconnect()
  }
}, { immediate: true })

const isLoginPage = computed(() => route.name === 'Login')

router.onError((err) => {
  notificationStore.error(err?.message || String(err))
  console.error('[Router]', err)
})

onErrorCaptured((err) => {
  notificationStore.error(err?.message || String(err))
  console.error('[App render]', err)
  return false
})
</script>

<template>
  <div class="root">
    <ToastContainer />
    <GlobalModalHost />
    <GlobalConsoleDock v-if="!isLoginPage" />

    <!-- 液态玻璃动画背板 -->
    <div class="liquid-bg">
      <div class="blob blob-1"></div>
      <div class="blob blob-2"></div>
      <div class="blob blob-3"></div>
    </div>

    <Sidebar v-if="!isLoginPage" />
    <div class="workspace" :class="{ 'full-width': isLoginPage }">
      <main class="content" :class="{ 'full-width': isLoginPage }">
        <RouterView />
      </main>
      <EventPanel v-if="!isLoginPage" />
    </div>
  </div>
</template>

<style scoped>
.root {
  position: relative;
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* 液体背景层 */
.liquid-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(circle at 18% 12%, rgba(99, 102, 241, 0.18), transparent 34%),
    radial-gradient(circle at 80% 20%, rgba(6, 182, 212, 0.12), transparent 32%),
    radial-gradient(circle at 50% 82%, rgba(168, 85, 247, 0.12), transparent 38%),
    var(--bg-deep);
  overflow: hidden;
}

.blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(96px);
  opacity: 0.34;
  animation: float 20s infinite ease-in-out alternate;
  mix-blend-mode: multiply;
}

.blob-1 {
  width: 55vw;
  height: 55vw;
  background: radial-gradient(circle, rgba(99, 102, 241, 0.45), rgba(99, 102, 241, 0));
  top: -20%;
  left: -10%;
  animation-delay: 0s;
}

.blob-2 {
  width: 45vw;
  height: 45vw;
  background: radial-gradient(circle, rgba(6, 182, 212, 0.32), rgba(6, 182, 212, 0));
  bottom: -20%;
  right: -10%;
  animation-duration: 25s;
}

.blob-3 {
  width: 35vw;
  height: 35vw;
  background: radial-gradient(circle, rgba(168, 85, 247, 0.30), rgba(168, 85, 247, 0));
  top: 40%;
  left: 30%;
  animation-duration: 30s;
}

.content {
  flex: 1 1 auto;
  margin-left: var(--sidebar-w);
  overflow-y: auto;
  overflow-x: hidden;
  background: transparent;
  z-index: 10;
  position: relative;
  transition: margin-left 0.3s ease;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.content.full-width {
  margin-left: 0;
}

.workspace {
  flex: 1;
  display: flex;
  min-width: 0;
  min-height: 0;
  height: 100%;
  position: relative;
  z-index: 10;
}

.workspace.full-width {
  min-width: 100%;
}
</style>
