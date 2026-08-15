import { createRouter, createWebHashHistory } from 'vue-router'
import LoginPage from '../views/LoginPage.vue'
import DashboardPage from '../views/DashboardPage.vue'
import TopologyPage from '../views/TopologyPage.vue'
import ListenerPage from '../views/ListenerPage.vue'
import ProxyPivotPage from '../views/ProxyPivotPage.vue'
import ScreenshotsPage from '../views/ScreenshotsPage.vue'
import DownloadsPage from '../views/DownloadsPage.vue'
import PluginsPage from '../views/PluginsPage.vue'
import HelpPage from '../views/HelpPage.vue'

const routes = [
  {
    path: '/',
    redirect: '/login'
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginPage
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: DashboardPage
  },
  {
    path: '/topology',
    name: 'Topology',
    component: TopologyPage
  },
  {
    path: '/listener',
    name: 'Listener',
    component: ListenerPage
  },
  {
    path: '/proxy',
    name: 'ProxyPivot',
    component: ProxyPivotPage
  },
  {
    path: '/screenshots',
    name: 'Screenshots',
    component: ScreenshotsPage
  },
  {
    path: '/downloads',
    name: 'Downloads',
    component: DownloadsPage
  },
  {
    path: '/plugins',
    name: 'Plugins',
    component: PluginsPage
  },
  {
    path: '/help',
    name: 'Help',
    component: HelpPage
  }
]

import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// 导航守卫：保护受限页面
router.beforeEach((to) => {
  const authStore = useAuthStore()

  if (to.name !== 'Login' && !authStore.isLoggedIn) {
    // 未登录且访问非登录页，强制重定向
    return { name: 'Login' }
  } else if (to.name === 'Login' && authStore.isLoggedIn) {
    // 已登录且尝试访问登录页，直接进仪表盘
    return { name: 'Dashboard' }
  }
})

export default router
