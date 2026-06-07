<script setup>
/**
 * GlobalModalHost - 全局弹窗宿主组件
 *
 * 集中管理和渲染所有全局弹窗（确认框、输入框、插件操作、生成 Beacon、文件浏览器等），统一由 modalStore 控制。
 */

import { useModalStore } from '../../stores/modal.js'
import ConfirmModal from '../common/ConfirmModal.vue'
import PromptModal from '../common/PromptModal.vue'
import PluginActionModal from '../plugin/PluginActionModal.vue'
import GenerateBeaconModal from '../listener/GenerateBeaconModal.vue'
import FileBrowserModal from '../dashboard/FileBrowserModal.vue'
import ProcessBrowserModal from '../dashboard/ProcessBrowserModal.vue'
import NetworkBrowserModal from '../dashboard/NetworkBrowserModal.vue'
import ExecuteTaskModal from '../dashboard/ExecuteTaskModal.vue'
import SleepConfigModal from '../dashboard/SleepConfigModal.vue'
import CascadeConnectModal from '../dashboard/CascadeConnectModal.vue'

const modalStore = useModalStore()
</script>

<template>
  <ConfirmModal />
  <PromptModal />
  <PluginActionModal />

  <GenerateBeaconModal v-if="modalStore.generateBeaconVisible" />

  <FileBrowserModal
    :visible="modalStore.fileBrowserVisible"
    :beaconid="modalStore.activeFileBrowserBeaconId || ''"
    @close="modalStore.closeFileBrowser()"
  />

  <ProcessBrowserModal
    :visible="modalStore.processBrowserVisible"
    :beaconid="modalStore.activeProcessBrowserBeaconId || ''"
    @close="modalStore.closeProcessBrowser()"
  />

  <NetworkBrowserModal
    :visible="modalStore.networkBrowserVisible"
    :beaconid="modalStore.activeNetworkBrowserBeaconId || ''"
    @close="modalStore.closeNetworkBrowser()"
  />

  <ExecuteTaskModal
    :visible="modalStore.executeModalVisible"
    :beaconid="modalStore.activeExecuteModal.beaconid || ''"
    :execution-type="modalStore.activeExecuteModal.executionType || ''"
    @close="modalStore.closeExecuteModal()"
  />

  <SleepConfigModal
    :visible="modalStore.sleepModalVisible"
    :beaconid="modalStore.activeSleepBeaconId || ''"
    @close="modalStore.closeSleepModal()"
  />

  <CascadeConnectModal />
</template>
