import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router/index'
import { i18n, normalizeLocale } from './i18n/index'
import './assets/styles/index.css'
import './assets/styles/sketch.css'

// 首帧前同步确定语言(localStorage -> 系统语言),避免语言闪烁;
// 消息文件由 App.vue 中的 localeStore.initLocale() 异步懒加载。
let initialLocale = ''
try {
  initialLocale = localStorage.getItem('ui-locale') || ''
} catch {
  // ignore
}
if (!initialLocale && typeof navigator !== 'undefined' && navigator.language) {
  initialLocale = navigator.language
}
i18n.global.locale.value = normalizeLocale(initialLocale) as 'zh-CN' | 'en-US'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n)
app.mount('#app')
