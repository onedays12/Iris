<script setup lang="ts">
/**
 * BeaconContextMenu - Beacon 右键上下文菜单
 *
 * 在拓扑图中右键点击 Beacon 节点时弹出的操作菜单，提供各种 Beacon 管理操作。
 */

import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBeaconActions } from '../../features/beacon/actions/useBeaconActions'
import type { BeaconMenuItem } from '../../features/beacon/actions/beaconActionDefinitions'

const props = defineProps({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  beaconid: { type: String, required: true },
})

const emit = defineEmits(['close'])
const { t } = useI18n()
const { getBeaconMenuItems, runBeaconAction } = useBeaconActions()

const menuRef = ref<HTMLElement | null>(null)
const adjustedX = ref(props.x)
const adjustedY = ref(props.y)
const menuItems = computed(() => getBeaconMenuItems(props.beaconid))

async function handleAction(item: BeaconMenuItem) {
  if (item?.disabled) return
  emit('close')
  await runBeaconAction(props.beaconid, item)
}

function handleClickOutside() {
  emit('close')
}

function handleContextMenuOutside(e: MouseEvent) {
  e.preventDefault()
  emit('close')
}

onMounted(async () => {
  await nextTick()
  if (menuRef.value) {
    const rect = menuRef.value.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const padding = 10

    adjustedX.value = props.x + rect.width > vw - padding
      ? Math.max(padding, props.x - rect.width)
      : props.x

    adjustedY.value = props.y + rect.height > vh - padding
      ? Math.max(padding, props.y - rect.height)
      : props.y
  }

  setTimeout(() => {
    document.addEventListener('click', handleClickOutside)
    document.addEventListener('contextmenu', handleContextMenuOutside)
  }, 0)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('contextmenu', handleContextMenuOutside)
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="menuRef"
      class="context-menu"
      :style="{ left: adjustedX + 'px', top: adjustedY + 'px' }"
      @click.stop
      @contextmenu.stop.prevent
    >
      <template v-for="(item, idx) in menuItems" :key="idx">
        <div v-if="item.type === 'divider'" class="divider"></div>

        <div v-else-if="item.type === 'group'" class="menu-group">
          <div class="menu-item menu-parent">
            <span class="menu-icon">{{ item.icon }}</span>
            <span class="menu-label">{{ t(item.labelKey || item.label || '') }}</span>
            <span class="submenu-arrow">›</span>
          </div>

          <div class="submenu">
            <div
              v-for="(child, childIdx) in item.children"
              :key="`${item.labelKey || item.label}-${childIdx}`"
              class="menu-item submenu-item"
              :class="{ disabled: child.disabled }"
              :title="child.disabledReasonKey ? t(child.disabledReasonKey) : child.disabledReason || child.label"
              @click="handleAction(child)"
            >
              <span class="menu-icon">{{ child.icon }}</span>
              <span class="submenu-label">{{ t(child.labelKey || child.label || '') }}</span>
            </div>
          </div>
        </div>

        <div
          v-else
          class="menu-item"
          :class="{ danger: item.danger, disabled: item.disabled }"
          :title="item.disabledReasonKey ? t(item.disabledReasonKey) : item.disabledReason || item.label"
          @click="handleAction(item)"
        >
          <span class="menu-icon">{{ item.icon }}</span>
          <span>{{ t(item.labelKey || item.label || '') }}</span>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 10000;
  min-width: 210px;
  padding: 8px;
  background:
    linear-gradient(180deg, var(--glass-highlight), rgba(255, 255, 255, 0.06) 42%, rgba(255, 255, 255, 0.02)),
    radial-gradient(var(--glass-grain) 0.5px, transparent 0.5px),
    var(--glass-popover-bg);
  background-size: auto, 3px 3px, auto;
  backdrop-filter: blur(var(--glass-blur-md)) saturate(155%);
  -webkit-backdrop-filter: blur(var(--glass-blur-md)) saturate(155%);
  border: 1px solid var(--glass-border-strong);
  border-radius: 16px;
  box-shadow: var(--shadow-lg);
  animation: fadeIn 0.15s ease;
  color: var(--text-secondary);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  border-radius: 10px;
  cursor: pointer;
  transition: var(--transition);
  border: 1px solid transparent;
}

.menu-item:hover {
  background: rgba(var(--color-primary-rgb), 0.1);
  border-color: rgba(var(--color-primary-rgb), 0.14);
  color: var(--text-primary);
}

.menu-item.disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.menu-item.disabled:hover {
  background: transparent;
  border-color: transparent;
  color: var(--text-secondary);
}

.menu-item.danger {
  color: var(--color-danger);
}

.menu-item.danger:hover {
  background: var(--color-danger-dim);
  border-color: rgba(239, 68, 68, 0.22);
}

.menu-icon {
  font-size: 14px;
  flex-shrink: 0;
  opacity: 0.88;
}

.menu-label,
.submenu-label {
  flex: 1;
}

.menu-group {
  position: relative;
}

.menu-parent {
  justify-content: space-between;
}

.submenu-arrow {
  font-size: 14px;
  color: var(--text-muted);
  margin-left: 6px;
  transition: var(--transition);
}

.menu-group:hover .submenu-arrow {
  color: var(--text-primary);
}

.submenu {
  display: none;
  position: absolute;
  left: calc(100% - 2px);
  top: -6px;
  min-width: 220px;
  padding: 8px;
  border-radius: 16px;
  background:
    linear-gradient(180deg, var(--glass-highlight), rgba(255, 255, 255, 0.06) 42%, rgba(255, 255, 255, 0.02)),
    radial-gradient(var(--glass-grain) 0.5px, transparent 0.5px),
    var(--glass-popover-bg);
  background-size: auto, 3px 3px, auto;
  backdrop-filter: blur(var(--glass-blur-md)) saturate(155%);
  -webkit-backdrop-filter: blur(var(--glass-blur-md)) saturate(155%);
  border: 1px solid var(--glass-border-strong);
  box-shadow: var(--shadow-lg);
  z-index: 10001;
}

.menu-group:hover > .submenu {
  display: block;
}

.submenu-item {
  justify-content: flex-start;
}

.divider {
  height: 1px;
  background: var(--border-light);
  margin: 7px 10px;
}

html[data-ui-theme="dark"] .context-menu,
html[data-ui-theme="dark"] .submenu {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(15, 23, 42, 0.02) 45%),
    radial-gradient(var(--glass-grain) 0.5px, transparent 0.5px),
    rgba(15, 23, 42, 0.88);
  background-size: auto, 3px 3px, auto;
  border-color: rgba(148, 163, 184, 0.26);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.38);
}

html[data-ui-theme="dark"] .menu-item:hover {
  background: rgba(var(--color-primary-rgb), 0.16);
  border-color: rgba(var(--color-primary-rgb), 0.22);
}

html[data-ui-theme="dark"] .menu-item.disabled:hover {
  background: transparent;
  border-color: transparent;
}

html[data-ui-theme="dark"] .divider {
  background: rgba(148, 163, 184, 0.16);
}
</style>
