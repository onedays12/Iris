<script setup>
/**
 * LoginPage - 登录页面
 * 提供用户名/密码登录、服务器地址配置，
 * 登录成功后建立 WebSocket 连接并跳转到 Dashboard。
 */

import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { login } from '../features/auth/api/authApi.js'
import { useAuthStore } from '../stores/auth.js'
import { useWSStore } from '../stores/ws.js'
import { Browser } from '@wailsio/runtime'

const router = useRouter()
const authStore = useAuthStore()
const wsStore = useWSStore()

const username = ref('admin')
const password = ref('')
const serverUrl = ref(authStore.apiBase || 'https://127.0.0.1:8080')
const isLoading = ref(false)
const isWSConnecting = ref(false)
const showSkipButton = ref(false)
const errorMsg = ref('')

async function handleLogin() {
  if (!username.value || !password.value) {
    errorMsg.value = '请输入用户名和密码'
    return
  }

  isLoading.value = true
  errorMsg.value = ''

  try {
    // 1. 先保存服务器地址
    authStore.setApiBase(serverUrl.value)
    
    // 2. 发起登录
    const data = await login(username.value, password.value)
    
    if (data && data.token) {
      // 1. 存储 Token
      authStore.setToken(data.token)
      
      // 2. 等待 App.vue 的 token watcher 建立 WebSocket
      isWSConnecting.value = true
      showSkipButton.value = false
      
      // setToken 会触发 App.vue 中的全局监听器建立 WebSocket
      await wsStore.waitForConnection()
      
      // 4. 跳转到仪表盘
      router.push('/dashboard')
    } else {
      throw new Error('未获取到有效凭证')
    }
  } catch (err) {
    errorMsg.value = err.message || '登录失败，请检查 TeamServer 状态'
    // 如果是 WS 阶段出错，显示跳过按钮
    if (isWSConnecting.value) {
      showSkipButton.value = true
    }
    // 注意：如果是 403，通常 token 是对的，所以不一定需要 logout
    if (!isWSConnecting.value) {
       authStore.logout() 
    }
    wsStore.disconnect()
  } finally {
    isLoading.value = false
    isWSConnecting.value = false
  }
}

function openAuthorHome() {
  Browser.OpenURL('https://github.com/onedays12')
}
</script>

<template>
  <div class="login-container">
    <div class="background-decor">
      <div class="blob blob-1"></div>
      <div class="blob blob-2"></div>
      <div class="blob blob-3"></div>
    </div>

    <div class="login-card glass-card">
      <header class="login-header">
        <div class="logo">
          <span class="logo-icon">💠</span>
          <h1>TeamServer</h1>
        </div>
        <p class="subtitle">终端认证管理系统</p>
      </header>

      <form class="login-form" @submit.prevent="handleLogin">
        <div class="form-group" :class="{ 'has-error': errorMsg && !serverUrl }">
          <label>服务器地址</label>
          <div class="input-wrapper">
            <span class="input-icon">🌐</span>
            <input 
              v-model="serverUrl" 
              type="text" 
              placeholder="例如: https://127.0.0.1:8080"
            >
          </div>
        </div>

        <div class="form-group" :class="{ 'has-error': errorMsg && !username }">
          <label>用户名</label>
          <div class="input-wrapper">
            <span class="input-icon">👤</span>
            <input 
              v-model="username" 
              type="text" 
              placeholder="请输入管理员账号"
              autocomplete="username"
            >
          </div>
        </div>

        <div class="form-group" :class="{ 'has-error': errorMsg && !password }">
          <label>密码</label>
          <div class="input-wrapper">
            <span class="input-icon">🔒</span>
            <input 
              v-model="password" 
              type="password" 
              placeholder="请输入访问秘钥"
              autocomplete="current-password"
            >
          </div>
        </div>

        <div class="error-info" v-if="errorMsg">
          <span class="error-icon">⚠️</span>
          {{ errorMsg }}
        </div>

        <button 
          class="login-btn" 
          type="submit" 
          :disabled="isLoading || isWSConnecting"
        >
          <template v-if="!isLoading && !isWSConnecting">
            <span>立即验证</span>
          </template>
          <template v-else-if="isWSConnecting">
            <div class="loader sm"></div>
            <span>建立受控链路...</span>
          </template>
          <template v-else>
            <div class="loader"></div>
          </template>
        </button>

        <button 
          v-if="showSkipButton"
          class="skip-btn" 
          type="button"
          @click="router.push('/dashboard')"
        >
          跳过链路检查，直接进入系统
        </button>
      </form>

      <footer class="login-footer">
        <p>
          &copy; 2026 制作 by
          <button type="button" class="author-link" @click="openAuthorHome">oneday</button>
        </p>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* 保持原有设计样式 */
.login-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-deep);
  overflow: hidden;
  position: relative;
}

.background-decor {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 0;
  filter: blur(80px);
}

.blob {
  position: absolute;
  border-radius: 50%;
  opacity: 0.6;
  animation: float 20s infinite alternate cubic-bezier(0.45, 0, 0.55, 1);
}

.blob-1 {
  width: 500px;
  height: 500px;
  background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
  top: -100px;
  left: -100px;
}

.blob-2 {
  width: 400px;
  height: 400px;
  background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%);
  bottom: -50px;
  right: -50px;
  animation-delay: -5s;
}

.blob-3 {
  width: 300px;
  height: 300px;
  background: linear-gradient(135deg, #ec4899 0%, #f43f5e 100%);
  top: 50%;
  left: 30%;
  animation-delay: -10s;
}

@keyframes float {
  0% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(5%, 10%) scale(1.1); }
  100% { transform: translate(-5%, -5%) scale(1); }
}

.login-card {
  width: 420px;
  padding: 40px;
  position: relative;
  z-index: 10;
  animation: slideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(30px); }
  to { opacity: 1; transform: translateY(0); }
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 8px;
}

.logo-icon {
  font-size: 32px;
}

.login-header h1 {
  font-size: 28px;
  font-weight: 700;
  background: linear-gradient(to right, var(--text-primary), var(--color-primary));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -0.5px;
}

.subtitle {
  color: var(--text-muted);
  font-size: 14px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  padding-left: 4px;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 14px;
  font-size: 16px;
  opacity: 0.6;
}

.input-wrapper input {
  width: 100%;
  padding: 14px 14px 14px 42px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 15px;
  transition: var(--transition);
}

.input-wrapper input:focus {
  outline: none;
  background: var(--bg-input-focus);
  border-color: var(--color-primary);
  outline: 3px solid var(--color-primary-dim);
}

.login-btn {
  margin-top: 12px;
  padding: 14px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition);
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-btn:hover:not(:disabled) {
  background: var(--color-primary-light);
  transform: translateY(-2px);
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.skip-btn {
  margin-top: 8px;
  padding: 10px;
  background: transparent;
  color: var(--text-muted);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  transition: var(--transition);
}

.skip-btn:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: var(--color-primary-dim);
}

.error-info {
  padding: 12px;
  background: var(--color-danger-dim);
  border-left: 3px solid var(--color-danger);
  border-radius: var(--radius-sm);
  color: var(--color-danger);
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both;
}

@keyframes shake {
  10%, 90% { transform: translate3d(-1px, 0, 0); }
  20%, 80% { transform: translate3d(2px, 0, 0); }
  30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
  40%, 60% { transform: translate3d(4px, 0, 0); }
}

.loader {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255,255,255,0.3);
  border-radius: 50%;
  border-top-color: #fff;
  animation: spin 0.8s linear infinite;
}

.loader.sm {
  width: 14px;
  height: 14px;
  margin-right: 10px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.login-footer {
  margin-top: 32px;
  text-align: center;
}

.login-footer p {
  font-size: 12px;
  color: var(--text-muted);
}

.author-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: color 0.18s ease;
}

.author-link:hover {
  color: var(--color-primary);
}
</style>
