<script setup>
/**
 * Sidebar - 全局侧边导航栏
 * 包含导航菜单、在线 Agent 计数、主题切换、
 * 日志导出、退出登录等功能入口。
 */

import { computed, ref } from 'vue'
import { Dialogs } from '@wailsio/runtime'
import * as FileService from '../../../bindings/irisclient/service/fileservice.js'
import { useRoute, useRouter } from 'vue-router'
import { logout } from '../../features/auth/api/authApi.js'
import { useAuthStore } from '../../stores/auth.js'
import { useModalStore } from '../../stores/modal.js'
import { useNotificationStore } from '../../stores/notification.js'
import { useThemeStore } from '../../stores/theme.js'
import { useWSStore } from '../../stores/ws.js'
import defaultAvatar from '../../assets/default-avatar.jpg'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const modalStore = useModalStore()
const notificationStore = useNotificationStore()
const themeStore = useThemeStore()
const wsStore = useWSStore()
const isLoggingOut = ref(false)
const AVATAR_STORAGE_KEY = 'iris-user-avatar'
const MAX_AVATAR_SIZE = 2 * 1024 * 1024
const AVATAR_MIME_BY_EXT = {
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

const avatarSrc = ref(loadAvatar())

const connectionStatus = computed(() => {
  switch (wsStore.status) {
    case 'open': return { label: 'TeamServer 已连接', class: 'online' }
    case 'connecting': return { label: '正在连接服务器...', class: 'connecting' }
    case 'error': return { label: '连接失败 (证书错误?)', class: 'error' }
    default: return { label: '后台服务未就绪', class: 'offline' }
  }
})

const navItems = [
  { path: '/dashboard', label: '仪表盘', icon: 'dashboard' },
  { path: '/topology', label: '拓扑图', icon: 'topology' },
  { path: '/listener', label: '生成监听器', icon: 'listener' },
  { path: '/proxy', label: 'Proxy Pivot', icon: 'proxy' },
  { path: '/screenshots', label: 'Screenshots', icon: 'screenshots' },
  { path: '/downloads', label: '下载文件', icon: 'downloads' },
  { path: '/plugins', label: '插件', icon: 'plugins' },
  { path: '/help', label: '帮助', icon: 'help' },
]

function navigateTo(path) {
  if (route.path === path) return
  router.push(path)
}

function loadAvatar() {
  try {
    return localStorage.getItem(AVATAR_STORAGE_KEY) || defaultAvatar
  } catch {
    return defaultAvatar
  }
}

function getAvatarMimeType(path) {
  const ext = String(path || '').split('.').pop()?.toLowerCase()
  return AVATAR_MIME_BY_EXT[ext] || ''
}

async function openAvatarPicker() {
  try {
    const picked = await Dialogs.OpenFile({
      Title: '选择头像图片',
      Message: '请选择 PNG、JPG、WebP 或 GIF 图片',
      CanChooseFiles: true,
      AllowsMultipleSelection: false,
      Filters: [
        { DisplayName: '图片文件', Pattern: '*.png;*.jpg;*.jpeg;*.webp;*.gif' },
      ],
    })
    const sourcePath = Array.isArray(picked) ? picked[0] : picked
    if (!sourcePath) return

    const mimeType = getAvatarMimeType(sourcePath)
    if (!mimeType) {
      notificationStore.error('请选择图片文件')
      return
    }

    const base64Data = await FileService.ReadBinaryFileBase64(sourcePath)
    const estimatedSize = Math.floor(String(base64Data || '').length * 3 / 4)
    if (estimatedSize > MAX_AVATAR_SIZE) {
      notificationStore.error('头像图片不能超过 2MB')
      return
    }

    const result = `data:${mimeType};base64,${base64Data}`
    avatarSrc.value = result
    try {
      localStorage.setItem(AVATAR_STORAGE_KEY, result)
    } catch {
      notificationStore.error('头像保存失败，请选择更小的图片')
      return
    }
    notificationStore.success('头像已更新')
  } catch (err) {
    notificationStore.error(err.message || '头像选择失败')
    console.error('[Sidebar] 头像选择失败:', err)
  }
}

async function handleLogout() {
  if (isLoggingOut.value) return

  const confirmed = await modalStore.showConfirm({
    title: '确认登出',
    message: '确定要退出当前登录会话吗？\n确认后会通知 TeamServer 注销当前 Token，并返回登录页。',
    type: 'warning',
    confirmText: '确认登出'
  })
  if (!confirmed) return

  isLoggingOut.value = true
  let remoteLoggedOut = false

  try {
    await logout()
    remoteLoggedOut = true
  } catch (err) {
    console.warn('[Auth] logout request failed, clear local session anyway:', err)
  } finally {
    authStore.logout()
    wsStore.disconnect()
    if (remoteLoggedOut) {
      notificationStore.success('已登出')
    }
    router.replace({ name: 'Login' })
    isLoggingOut.value = false
  }
}
</script>

<template>
  <aside class="sidebar">
    <!-- Logo -->
    <div class="logo">
      <div class="brand">
        <div class="logo-icon">
          <button
            type="button"
            class="avatar-button"
            title="上传个人头像"
            aria-label="上传个人头像"
            @click="openAvatarPicker"
          >
            <img :src="avatarSrc" alt="Iris Client" @error="avatarSrc = defaultAvatar" />
            <span class="avatar-overlay">更换</span>
          </button>
        </div>
        <div class="logo-text">
          <span class="logo-name">Iris Client</span>
          <span class="logo-version">v0.1.5</span>
        </div>
      </div>
      <div class="logo-actions">
        <button
          type="button"
          class="theme-btn"
          :title="`切换到 ${themeStore.nextLabel} 主题`"
          :aria-label="`切换到 ${themeStore.nextLabel} 主题`"
          @click="themeStore.toggleTheme()"
        >
          <span>{{ themeStore.isDark ? '☾' : themeStore.isPaper ? '◆' : '☼' }}</span>
        </button>
        <button
          type="button"
          class="logout-btn"
          :disabled="isLoggingOut"
          title="登出"
          aria-label="登出"
          @click="handleLogout"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <path d="M16 17l5-5-5-5"/>
            <path d="M21 12H9"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 导航 -->
    <nav class="nav">
      <div class="section-label">导航</div>
      <button
        v-for="item in navItems"
        :key="item.path"
        type="button"
        class="nav-item"
        :class="{ active: route.path === item.path }"
        @click.prevent.stop="navigateTo(item.path)"
      >
        <!-- 仪表盘图标 -->
        <svg v-if="item.icon === 'dashboard'" class="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7" rx="1"/>
          <rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/>
          <rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
        <!-- 拓扑图图标 -->
        <svg v-else-if="item.icon === 'topology'" class="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="5" r="3"/>
          <circle cx="5" cy="19" r="3"/>
          <circle cx="19" cy="19" r="3"/>
          <line x1="12" y1="8" x2="5" y2="16"/>
          <line x1="12" y1="8" x2="19" y2="16"/>
        </svg>
        <!-- 监听器图标 -->
        <svg v-else-if="item.icon === 'listener'" class="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4.93 4.93a10 10 0 0 1 14.14 0"/>
          <path d="M7.76 7.76a6 6 0 0 1 8.48 0"/>
          <circle cx="12" cy="12" r="2" fill="currentColor"/>
          <line x1="12" y1="14" x2="12" y2="22"/>
        </svg>
        <!-- 客户端图标 -->
        <svg v-else-if="item.icon === 'client'" class="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
        <!-- 键盘记录图标 -->
        <svg v-else-if="item.icon === 'keylogger'" class="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="4" width="20" height="16" rx="2" ry="2"/>
          <line x1="6" y1="8" x2="6.01" y2="8"/>
          <line x1="10" y1="8" x2="10.01" y2="8"/>
          <line x1="14" y1="8" x2="14.01" y2="8"/>
          <line x1="18" y1="8" x2="18.01" y2="8"/>
          <line x1="8" y1="12" x2="8.01" y2="12"/>
          <line x1="12" y1="12" x2="12.01" y2="12"/>
          <line x1="16" y1="12" x2="16.01" y2="12"/>
          <line x1="7" y1="16" x2="17" y2="16"/>
        </svg>
        <!-- Proxy Pivot 图标 -->
        <svg v-else-if="item.icon === 'proxy'" class="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 20h9"/>
          <path d="M16.5 14c-2 0-3.5 1-3.5 2s1.5 2 3.5 2h5v-4h-5z"/>
          <path d="M2.5 10c2 0 3.5-1 3.5-2s-1.5-2-3.5-2h-1v4h1z"/>
          <path d="M12 14c-1.5 0-2.5-1.5-2.5-3s1-3 2.5-3 2.5 1.5 2.5 3-1 3-2.5 3z"/>
          <path d="M5.5 8l4 2.5"/>
          <path d="M14.5 10.5l4 2.5"/>
        </svg>
        <!-- Screenshots 图标 -->
        <svg v-else-if="item.icon === 'screenshots'" class="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <!-- 下载文件图标 -->
        <svg v-else-if="item.icon === 'downloads'" class="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 3v12"/>
          <path d="M7 10l5 5 5-5"/>
          <path d="M4 17v3h16v-3"/>
        </svg>
        <!-- 插件图标 -->
        <svg v-else-if="item.icon === 'plugins'" class="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2l2.2 4.7 5.1.7-3.7 3.6.9 5.1L12 14.8 7.5 16.1l.9-5.1L4.7 7.4l5.1-.7L12 2z"/>
          <path d="M12 14.8V22"/>
          <path d="M7.5 16.1l-2.9 2.9"/>
          <path d="M16.5 16.1l2.9 2.9"/>
        </svg>
        <!-- 凭据图标 -->
        <svg v-else-if="item.icon === 'credentials'" class="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
        </svg>
        <!-- 帮助图标 -->
        <svg v-else-if="item.icon === 'help'" class="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
          <circle cx="12" cy="17" r="0.5" fill="currentColor"/>
        </svg>

        <span>{{ item.label }}</span>

        <!-- 活跃指示器 (由 CSS .active 类控制显隐) -->
        <span class="active-indicator"></span>
      </button>
    </nav>

    <!-- 底部状态 -->
    <div class="sidebar-footer">
      <div class="status-badge" :title="connectionStatus.label">
        <span class="status-dot" :class="connectionStatus.class"></span>
        <span class="status-text">{{ connectionStatus.label }}</span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: var(--sidebar-w);
  background: var(--bg-sidebar);
  backdrop-filter: blur(var(--glass-blur-lg)) saturate(160%);
  -webkit-backdrop-filter: blur(var(--glass-blur-lg)) saturate(160%);
  border-right: 1px solid var(--glass-border);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  z-index: 100;
  user-select: none;
}

/* Logo */
.logo {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 13px;
  padding: 20px 16px 18px;
  border-bottom: 1px solid var(--border-light);
  margin-bottom: 10px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.logo-icon {
  width: 58px;
  height: 58px;
  flex-shrink: 0;
}

.avatar-button {
  width: 100%;
  height: 100%;
  position: relative;
  display: block;
  padding: 0;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 18px;
  box-shadow:
    0 10px 24px rgba(15, 23, 42, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
  cursor: pointer;
  transition: var(--transition);
}

.avatar-button img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.avatar-button:hover {
  transform: translateY(-1px);
  border-color: rgba(var(--color-primary-rgb), 0.34);
}

.avatar-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  background: rgba(15, 23, 42, 0.58);
  opacity: 0;
  transition: var(--transition);
}

.avatar-button:hover .avatar-overlay {
  opacity: 1;
}

.logo-text {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}

.logo-name {
  font-size: 17px;
  line-height: 1.1;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.45px;
  white-space: nowrap;
}

.logo-version {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 0.5px;
}

.logo-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  gap: 10px;
}

.theme-btn,
.logout-btn {
  width: 100%;
  height: 36px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid var(--border-light);
  border-radius: 13px;
  cursor: pointer;
  transition: var(--transition);
}

.theme-btn {
  font-size: 16px;
  font-weight: 700;
}

.theme-btn:hover {
  color: var(--color-primary);
  background: var(--color-primary-dim);
  border-color: rgba(var(--color-primary-rgb), 0.22);
  transform: translateY(-1px);
}

.logout-btn:hover:not(:disabled) {
  color: var(--color-danger);
  background: var(--color-danger-dim);
  border-color: rgba(239, 68, 68, 0.24);
  transform: translateY(-1px);
}

.logout-btn:disabled {
  cursor: wait;
  opacity: 0.55;
}

/* 导航 */
.nav {
  flex: 1;
  padding: 4px 0;
  overflow-y: auto;
}

.section-label {
  padding: 12px 18px 6px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1.2px;
  color: var(--text-muted);
  text-transform: uppercase;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: calc(100% - 20px);
  padding: 11px 18px;
  margin: 2px 10px;
  font-size: 13px;
  font-weight: 450;
  color: var(--text-secondary);
  border-radius: 10px;
  transition: var(--transition);
  cursor: pointer;
  position: relative;
  background: transparent;
  border: 1px solid transparent;
  text-decoration: none;
  text-align: left;
  appearance: none;
}

.nav-item:hover {
  color: var(--text-primary);
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.03);
}

.nav-item.active {
  color: var(--color-primary);
  background: rgba(79, 70, 229, 0.12);
  font-weight: 600;
  border-color: rgba(99, 102, 241, 0.2);
}

.nav-icon {
  flex-shrink: 0;
  opacity: 0.6;
  transition: var(--transition);
}

.nav-item:hover .nav-icon,
.nav-item.active .nav-icon {
  opacity: 1;
}

.nav-item.active .nav-icon {
  color: var(--color-primary);
}

.active-indicator {
  position: absolute;
  left: -10px;
  top: 50%;
  transform: translateY(-50%) scaleX(0);
  width: 4px;
  height: 20px;
  background: var(--color-primary);
  border-radius: 0 4px 4px 0;
  transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  transform-origin: left;
}

.nav-item.active .active-indicator {
  transform: translateY(-50%) scaleX(1);
}

/* 底部状态 */
.sidebar-footer {
  padding: 14px 18px;
  border-top: 1px solid var(--border);
  background: linear-gradient(to top, rgba(0, 0, 0, 0.15), transparent);
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
}

.status-dot.online { background: #10b981; }
.status-dot.offline { background: #ef4444; }
.status-dot.connecting { 
  background: #f59e0b; 
  animation: pulse-op 1.5s infinite;
}
.status-dot.error { background: #f87171; }

@keyframes pulse-op {
  0% { opacity: 0.4; }
  50% { opacity: 1; }
  100% { opacity: 0.4; }
}

.status-text {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
