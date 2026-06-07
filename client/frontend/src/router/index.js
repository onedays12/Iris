import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/login'
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginPage.vue')
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('../views/DashboardPage.vue')
  },
  {
    path: '/topology',
    name: 'Topology',
    component: () => import('../views/TopologyPage.vue')
  },
  {
    path: '/listener',
    name: 'Listener',
    component: () => import('../views/ListenerPage.vue')
  },
  {
    path: '/keylogger',
    redirect: '/dashboard'
  },
  {
    path: '/proxy',
    name: 'ProxyPivot',
    component: () => import('../views/ProxyPivotPage.vue')
  },
  {
    path: '/screenshots',
    name: 'Screenshots',
    component: () => import('../views/ScreenshotsPage.vue')
  },
  {
    path: '/downloads',
    name: 'Downloads',
    component: () => import('../views/DownloadsPage.vue')
  },
  {
    path: '/plugins',
    name: 'Plugins',
    component: () => import('../views/PluginsPage.vue')
  },
  {
    path: '/credentials',
    redirect: '/dashboard'
  },
  {
    path: '/help',
    name: 'Help',
    component: () => import('../views/HelpPage.vue')
  }
]

import { useAuthStore } from '../stores/auth.js'

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
