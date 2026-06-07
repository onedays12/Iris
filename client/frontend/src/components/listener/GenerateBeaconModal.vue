<script setup>
/**
 * GenerateBeaconModal - Beacon 生成弹窗
 * 配置并生成 Beacon Payload（可执行文件/DLL/Shellcode），
 * 支持架构、C2 Profile、回调监听器等参数选择。
 */

import { ref, computed, watch } from 'vue'
import { useModalStore } from '../../stores/modal.js'
import { useListenerStore } from '../../stores/listener.js'
import { useNotificationStore } from '../../stores/notification.js'
import { generatePayload, generateShellcode } from '../../features/payload/api/payloadApi.js'
import * as FileService from '../../../bindings/changeme/service/fileservice.js'
import { Dialogs } from '@wailsio/runtime'

const modalStore = useModalStore()
const listenerStore = useListenerStore()
const notificationStore = useNotificationStore()

const generationMode = ref('beacon')
const os = ref('windows')
const arch = ref('amd64')
const format = ref('exe')
const stageMode = ref('stagerless')
const beaconType = ref('go')
const generating = ref(false)
const generatingShellcode = ref(false)
const shellcodeFileInputRef = ref(null)
const shellcodeFilePath = ref('')
const shellcodeSelectedFile = ref(null)
const shellcodeMode = ref('front')
const shellcodeLoaderName = ref('ReflectiveLoader')

const activeListener = computed(() => {
  return listenerStore.listeners.find(l => l.id === modalStore.activeGenerateBeaconListenerId)
})

const activeListenerConfig = computed(() => {
  const config = activeListener.value?.config
  if (!config) return {}
  if (typeof config === 'string') {
    try {
      return JSON.parse(config)
    } catch {
      return {}
    }
  }
  return typeof config === 'object' && !Array.isArray(config) ? config : {}
})

const activeListenerProtocol = computed(() => String(activeListener.value?.protocol || '').toLowerCase())
const activeListenerType = computed(() => {
  return String(activeListener.value?.listener_type || activeListenerConfig.value?.listener_type || 'external').toLowerCase()
})
const activeListenerStatus = computed(() => String(activeListener.value?.status || '').toLowerCase())
const activeListenerStagerConfig = computed(() => {
  const stager = activeListenerConfig.value?.stager
  return stager && typeof stager === 'object' && !Array.isArray(stager) ? stager : null
})
const activeListenerStagerEnabled = computed(() => {
  const stager = activeListenerStagerConfig.value
  if (!stager) return false
  if (typeof stager.enabled === 'boolean') return stager.enabled
  return true
})
const activeListenerHasStagerConfig = computed(() => {
  const stager = activeListenerStagerConfig.value
  if (!stager) return false
  return Boolean(
    stager.bind_host ||
    stager.bind_port ||
    stager.callback_host ||
    stager.callback_port ||
    stager.base_uri
  )
})
const activeListenerSupportsHttpStager = computed(() => {
  return activeListenerType.value === 'external' &&
    ['http', 'https'].includes(activeListenerProtocol.value) &&
    activeListenerStagerEnabled.value &&
    activeListenerHasStagerConfig.value
})

const osOptions = computed(() => {
  if (isInternal.value) {
    return [{ label: 'Windows', value: 'windows', icon: '🪟' }]
  }
  return [
    { label: 'Windows', value: 'windows', icon: '🪟' },
    { label: 'Linux', value: 'linux', icon: '🐧' },
  ]
})

const windowsArchOptions = [
  { label: 'amd64 (64位)', value: 'amd64' },
  { label: 'x86 (32位)', value: 'x86' },
]
const linuxArchOptions = [
  { label: 'amd64 (64位)', value: 'amd64' },
]
const macArchOptions = [
  { label: 'arm (Apple Silicon)', value: 'arm' },
]

const generationModeOptions = [
  { label: '生成 Beacon 客户端', value: 'beacon' },
  { label: '生成 Shellcode', value: 'shellcode' },
]
const stageModeOptions = [
  { label: 'Stagerless（完整 Payload）', value: 'stagerless', description: '生成完整 Beacon payload，行为与旧版本一致。' },
  { label: 'Stager（分阶段）', value: 'stager', description: '生成 stager payload，并由 Listener HTTP Stager 下载完整 stage。' },
]
const beaconTypeOptions = [
  { label: 'Go-Beacon', value: 'go', description: 'Go 实现，支持 Windows / Linux / macOS' },
  { label: 'C-Beacon', value: 'c', description: 'C 实现，仅支持 Windows' },
]
const shellcodeModeOptions = [
  { label: 'front', value: 'front', description: '在 PE 前拼接 bootstrap 和 RDI shellcode，再追加 PE 内容' },
  { label: 'post', value: 'post', description: '将 bootstrap 写入 PE 起始位置，并在 PE 后追加 RDI shellcode' },
  { label: 'embed', value: 'embed', description: '查找 DLL 导出的 loader 函数，将 DOS 头替换为跳转 stub' },
]

const isInternal = computed(() => activeListenerType.value === 'internal')

const isShellcodeMode = computed(() => generationMode.value === 'shellcode')
const needsShellcodeLoaderName = computed(() => shellcodeMode.value === 'embed')
const currentShellcodeModeMeta = computed(() => {
  return shellcodeModeOptions.find(item => item.value === shellcodeMode.value) || shellcodeModeOptions[0]
})
const currentStageModeMeta = computed(() => {
  return stageModeOptions.find(item => item.value === stageMode.value) || stageModeOptions[0]
})
const availableArchOptions = computed(() => {
  if (isInternal.value) return [{ label: 'amd64 (64位)', value: 'amd64' }]
  if (os.value === 'mac') return macArchOptions
  if (os.value === 'linux') return linuxArchOptions
  return windowsArchOptions
})
const availableStageModeOptions = computed(() => {
  return stageModeOptions.map(item => ({
    ...item,
    disabled: item.value === 'stager' && (os.value !== 'windows' || isInternal.value),
  }))
})
const availableBeaconTypes = computed(() => {
  if (isInternal.value) return [{ label: 'C-Beacon', value: 'c', description: 'C 实现，Internal 监听器固定使用' }]
  if (os.value === 'mac' || os.value === 'linux') return [{ label: 'Go-Beacon', value: 'go', description: 'Go 实现，当前 OS 固定使用' }]
  return beaconTypeOptions
})
const modalTitle = computed(() => isShellcodeMode.value ? '生成 Shellcode' : '生成 Beacon 客户端')
const primaryButtonLabel = computed(() => {
  if (isShellcodeMode.value) {
    return generatingShellcode.value ? '生成中...' : '💾 生成并保存'
  }
  return generating.value ? '编译中...' : '🚀 编译并保存'
})
const isBusy = computed(() => generating.value || generatingShellcode.value)
const canGenerateBeacon = computed(() => {
  if (!activeListener.value) return false
  if (activeListenerStatus.value !== 'started') return false
  if (stageMode.value !== 'stager') return true
  return os.value === 'windows' && activeListenerSupportsHttpStager.value
})
const generateDisabled = computed(() => {
  return isBusy.value
})
const warningText = computed(() => {
  if (isShellcodeMode.value) {
    return `前端会把你选择的本地 PE 文件编码后发送给后端，以 ${currentShellcodeModeMeta.value.label} 模式生成 shellcode，再保存到本地。`
  }
  if (isInternal.value) {
    return 'Internal Cascade Beacon 仅支持 Windows，由父级 Beacon 承载并转发通信。后端将自动注入级联配置（加密密钥、协议特征）到模板中。'
  }
  if (activeListener.value && activeListenerStatus.value !== 'started') {
    return '生成前要求 Listener 状态为 started；paused、stopped、error 等状态都会被后端拒绝。'
  }
  if (stageMode.value === 'stager') {
    if (os.value !== 'windows') {
      return 'Stager 模板当前支持 Windows amd64 和 Windows 32 位；Linux 请使用 Stagerless。'
    }
    if (!activeListenerSupportsHttpStager.value) {
      if (!['http', 'https'].includes(activeListenerProtocol.value) || activeListenerType.value !== 'external') {
        return 'Stager 模式要求 Listener 类型为 external http/https。'
      }
      if (!activeListenerStagerEnabled.value) {
        return '当前选择了 Stager 模式，但目标 Listener 的 C2 Profile 未启用 HTTP Stager。'
      }
      return '当前选择了 Stager 模式，但目标 Listener 缺少 HTTP Stager 端点配置。'
    }
    if (arch.value === 'x86') {
      return '当前选择了 32 位 Stager；后端使用 stager_windows_32.*，完整 stage 需要匹配 beacon_windows_x86.dll，并写入 static/stages/<stage_id>/stage.bin。'
    }
    if (format.value === 'c') {
      return '当前选择了 Stager C 数组格式；后端返回 base64 编码的 C 源码文本，保存后为 .c 文件，完整 stage 会写入 TeamServer 的 static/stages/<stage_id>/stage.bin。'
    }
    return '当前选择了 Stager 模式；format=exe 返回 PE stager，format=bin 返回 shellcode stager，format=c 返回 C 数组源码，完整 stage 会写入 TeamServer 的 static/stages/<stage_id>/stage.bin。'
  }
  return '生成过程将根据监听模式自动注入加密密钥与传输协议特征。format=exe 返回 PE，format=bin 返回 shellcode。'
})

// 根据 OS 和 Beacon 类型动态计算可用格式
const availableFormats = computed(() => {
  if (isInternal.value) {
    return [{ label: 'Executable (.exe)', value: 'exe' }]
  }
  if (beaconType.value === 'c') {
    return [{ label: 'Executable (.exe)', value: 'exe' }]
  }
  switch (os.value) {
    case 'windows': {
      const formats = [
        { label: 'Executable (.exe)', value: 'exe' },
        { label: 'Shellcode (.bin)', value: 'bin' },
      ]
      if (stageMode.value === 'stager') {
        formats.push({ label: 'C Array Source (.c)', value: 'c' })
      }
      return formats
    }
    case 'linux': return [
      { label: 'ELF Executable', value: 'elf' },
    ]
    case 'mac': return [
      { label: 'Mach-O Executable', value: 'macho' },
    ]
    default: return [{ label: 'Executable (.exe)', value: 'exe' }]
  }
})

// 切换操作系统时，联动 arch / format / beaconType
watch(os, (newOs) => {
  if (newOs === 'mac') {
    beaconType.value = 'go'
    arch.value = 'arm'
    format.value = 'macho'
  } else if (newOs === 'linux') {
    beaconType.value = 'go'
    format.value = 'elf'
  } else {
    format.value = 'exe'
  }
  if (!availableArchOptions.value.some(item => item.value === arch.value)) {
    arch.value = availableArchOptions.value[0]?.value || 'amd64'
  }
  if (newOs !== 'windows' && stageMode.value === 'stager') {
    stageMode.value = 'stagerless'
  }
})

watch(stageMode, (mode) => {
  if (mode !== 'stager') {
    if (format.value === 'c') {
      if (os.value === 'windows') format.value = 'exe'
      else if (os.value === 'mac') format.value = 'macho'
      else format.value = 'elf'
    }
    return
  }
  os.value = 'windows'
  if (!['exe', 'bin', 'c'].includes(format.value)) {
    format.value = 'exe'
  }
  if (!windowsArchOptions.some(item => item.value === arch.value)) {
    arch.value = 'amd64'
  }
})

// Internal listener: lock all fields
watch(isInternal, (val) => {
  if (val) {
    beaconType.value = 'c'
    os.value = 'windows'
    arch.value = 'amd64'
    format.value = 'exe'
    stageMode.value = 'stagerless'
  }
}, { immediate: true })

// C-Beacon: force Windows + exe
watch(beaconType, (type) => {
  if (type === 'c') {
    if (os.value === 'mac' || os.value === 'linux') os.value = 'windows'
    format.value = 'exe'
  }
})

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = () => reject(reader.error || new Error('读取本地文件失败'))
    reader.readAsDataURL(file)
  })
}

function buildShellcodeDefaultName(fileName) {
  const sourceName = String(fileName || 'shellcode')
  const trimmed = sourceName.replace(/\.(exe|dll)$/i, '')
  return `${trimmed || 'shellcode'}.bin`
}

function triggerShellcodeFileInput() {
  if (generating.value || generatingShellcode.value) return
  if (shellcodeFileInputRef.value) {
    shellcodeFileInputRef.value.click()
  }
}

async function generateShellcodeFromFile(file) {
  generatingShellcode.value = true
  try {
    const peBase64 = await readFileAsBase64(file)
    const result = await generateShellcode({
      mode: shellcodeMode.value,
      pe_base64: peBase64,
      loader_name: needsShellcodeLoaderName.value
        ? String(shellcodeLoaderName.value || 'ReflectiveLoader')
        : undefined,
    })

    const shellcode = result?.shellcode ?? result?.data?.shellcode
    if (!shellcode) {
      throw new Error(result?.message || result?.error || '生成 shellcode 失败')
    }

    const savePath = await Dialogs.SaveFile({
      Title: '保存生成的 Shellcode',
      Filename: buildShellcodeDefaultName(file?.name),
      Filters: [
        { Name: 'Shellcode Files', Pattern: '*.bin' }
      ]
    })

    if (!savePath) {
      notificationStore.info('已取消保存')
      return
    }

    await FileService.WriteBinaryFile(savePath, shellcode)
    notificationStore.success('Shellcode 生成成功并已保存到本地')
  } catch (err) {
    console.error('Shellcode generation failed:', err)
    notificationStore.error(`生成 Shellcode 失败: ${err.message || err}`)
  } finally {
    generatingShellcode.value = false
  }
}

async function handleShellcodeFileSelected(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  shellcodeSelectedFile.value = file
  shellcodeFilePath.value = file.name
}

async function handleGenerateShellcode() {
  if (!shellcodeSelectedFile.value) {
    notificationStore.warn('请先选择待转换的 PE 文件')
    return
  }

  await generateShellcodeFromFile(shellcodeSelectedFile.value)
}

async function handleGenerateBeacon() {
  if (!activeListener.value) {
    notificationStore.warn('请先选择 Listener')
    return
  }
  if (activeListenerStatus.value !== 'started') {
    notificationStore.warn('生成前请先启动 Listener')
    return
  }
  if (stageMode.value === 'stager') {
    if (os.value !== 'windows') {
      notificationStore.warn('Stager 当前仅支持 Windows amd64 / 32 位')
      return
    }
    if (!activeListenerSupportsHttpStager.value) {
      if (!['http', 'https'].includes(activeListenerProtocol.value) || activeListenerType.value !== 'external') {
        notificationStore.warn('Stager 模式要求 Listener 类型为 external http/https')
        return
      }
      if (!activeListenerStagerEnabled.value) {
        notificationStore.warn('当前 Listener 的 C2 Profile 未启用 HTTP Stager，请编辑 Listener 并选择启用了 stager 的 profile')
        return
      }
      notificationStore.warn('当前 Listener 缺少 HTTP Stager 端点配置，请编辑 Listener 后再生成')
      return
    }
  } else if (format.value === 'c') {
    notificationStore.warn('C 数组格式仅支持 Stager 模式')
    return
  }

  generating.value = true
  try {
    // 1. 调用后端生成 Payload
    const result = await generatePayload({
      listener_id: activeListener.value.id,
      os: os.value,
      arch: arch.value,
      format: format.value,
      stage_mode: stageMode.value,
      beacon_type: beaconType.value,
    })

    const payload = result?.payload ?? result?.data?.payload
    if (!payload) {
      throw new Error(result?.message || result?.error || '生成失败')
    }

    // 2. 弹出系统保存对话框
    const ext = format.value === 'c' ? 'c' : format.value
    const responseFileName = result?.file_name ?? result?.data?.file_name ?? ''
    const defaultName = responseFileName || `${stageMode.value === 'stager' ? 'stager' : 'beacon'}_${os.value}_${arch.value}_${activeListener.value.name}.${ext}`
    const filterName = format.value === 'c' ? 'C Source Files' : 'Payload Files'
    
    const savePath = await Dialogs.SaveFile({
      Title: stageMode.value === 'stager' ? '保存生成的 Stager' : '保存生成的 Beacon',
      Filename: defaultName,
      Filters: [
        { Name: filterName, Pattern: `*.${ext}` }
      ]
    })

    if (!savePath) {
      notificationStore.info('已取消保存')
      return
    }

    // 3. 写入文件
    await FileService.WriteBinaryFile(savePath, payload)

    const responseStageMode = result?.stage_mode ?? result?.data?.stage_mode ?? stageMode.value
    const stageId = result?.stage_id ?? result?.data?.stage_id ?? ''
    const stageUrl = result?.stage_url ?? result?.data?.stage_url ?? ''
    notificationStore.success(
      stageUrl
        ? `${format.value === 'c' ? 'Stager C 源码' : 'Stager'} 生成成功并已保存到本地，Stage ID: ${stageId || '-'}，Stage URL: ${stageUrl}`
        : `Beacon 生成成功并已保存到本地 (${responseStageMode})`
    )
    modalStore.closeGenerateBeacon()
  } catch (err) {
    console.error('Payload generation failed:', err)
    notificationStore.error(`生成失败: ${err.message}`)
  } finally {
    generating.value = false
  }
}

async function handleGenerate() {
  if (isShellcodeMode.value) {
    await handleGenerateShellcode()
    return
  }

  await handleGenerateBeacon()
}

watch(generationMode, (mode) => {
  if (mode !== 'shellcode') return
  shellcodeFilePath.value = ''
  shellcodeSelectedFile.value = null
  shellcodeMode.value = 'front'
  shellcodeLoaderName.value = 'ReflectiveLoader'
})

watch(generationMode, (mode) => {
  if (mode === 'beacon') {
    stageMode.value = 'stagerless'
  }
})
</script>

<template>
<div class="modal-overlay">
    <div class="modal-container glass-card animate-slide-up">
      <div class="modal-header">
        <div class="header-tag">PAYLOAD GENERATOR</div>
        <h2>{{ modalTitle }}</h2>
        <button class="close-btn" @click="modalStore.closeGenerateBeacon()">×</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label>生成类型</label>
          <select v-model="generationMode" class="glass-select">
            <option v-for="item in generationModeOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </div>

        <!-- 监听器信息 -->
        <div class="info-banner" v-if="!isShellcodeMode && activeListener">
          <span class="icon">📡</span>
          <div class="info-content">
            <label>目标监听器</label>
            <div class="value">{{ activeListener.name }} ({{ activeListener.protocol.toUpperCase() }})</div>
          </div>
        </div>

        <div v-if="!isShellcodeMode" class="config-sections">
          <!-- 维度 1: 操作系统 -->
          <div class="form-group">
            <label>目标操作系统 (OS)</label>
            <div class="os-grid">
              <div
                v-for="opt in osOptions"
                :key="opt.value"
                class="os-card"
                :class="{ active: os === opt.value, disabled: osOptions.length === 1 }"
                @click="osOptions.length > 1 && (os = opt.value)"
              >
                <div class="os-icon">{{ opt.icon }}</div>
                <div class="os-label">{{ opt.label }}</div>
              </div>
            </div>
          </div>

          <div class="form-row">
            <!-- 维度 2: 架构 -->
            <div class="form-group flex-1">
              <label>处理器架构 (Arch)</label>
              <select v-model="arch" class="glass-select" :disabled="availableArchOptions.length === 1">
                <option v-for="a in availableArchOptions" :key="a.value" :value="a.value">{{ a.label }}</option>
              </select>
            </div>

            <!-- 维度 3: 输出格式 -->
            <div class="form-group flex-1">
              <label>输出格式 (Format)</label>
              <select v-model="format" class="glass-select" :disabled="availableFormats.length === 1">
                <option v-for="f in availableFormats" :key="f.value" :value="f.value">{{ f.label }}</option>
              </select>
            </div>

            <!-- 维度 4: Beacon 类型 -->
            <div class="form-group flex-1">
              <label>Beacon 类型</label>
              <select v-model="beaconType" class="glass-select" :disabled="availableBeaconTypes.length === 1">
                <option v-for="bt in availableBeaconTypes" :key="bt.value" :value="bt.value">{{ bt.label }}</option>
              </select>
              <p class="field-hint">{{ availableBeaconTypes.find(bt => bt.value === beaconType)?.description }}</p>
            </div>
          </div>

          <div v-if="isInternal" class="internal-hint">
            <span class="hint-icon">🔗</span>
            <div>
              <strong>Cascade Internal Beacon</strong>
              <p>固定使用 C-Beacon (Windows / amd64 / exe)，由父级 Beacon 承载并转发通信，不支持 Stager 模式。</p>
            </div>
          </div>
          <div v-if="!isInternal && os === 'mac'" class="internal-hint">
            <span class="hint-icon">🍎</span>
            <div>
              <strong>macOS Beacon</strong>
              <p>macOS 仅支持 Go-Beacon (arm / macho)。</p>
            </div>
          </div>
          <div v-if="!isInternal && os === 'linux'" class="internal-hint">
            <span class="hint-icon">🐧</span>
            <div>
              <strong>Linux Beacon</strong>
              <p>Linux 仅支持 Go-Beacon (amd64 / elf)。</p>
            </div>
          </div>

          <div v-if="!isInternal" class="form-group stage-mode-group">
            <label>Stage 模式</label>
            <select v-model="stageMode" class="glass-select">
              <option
                v-for="item in availableStageModeOptions"
                :key="item.value"
                :value="item.value"
                :disabled="item.disabled"
              >
                {{ item.label }}
              </option>
            </select>
            <p class="help-text">{{ currentStageModeMeta.description }}</p>
            <p v-if="stageMode === 'stager' && !activeListenerStagerEnabled" class="help-text warning-text">
              当前 Listener 的 C2 Profile 未启用 HTTP Stager，请编辑 Listener 并选择启用了 stager 的 profile。
            </p>
            <p v-else-if="stageMode === 'stager' && !activeListenerSupportsHttpStager" class="help-text warning-text">
              Stager 要求 external http/https Listener，并配置 HTTP Stager 端点。
            </p>
          </div>
        </div>

        <div v-else class="config-sections">
          <div class="form-group">
            <label>Shellcode 模式</label>
            <select v-model="shellcodeMode" class="glass-select">
              <option v-for="item in shellcodeModeOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
            <p class="help-text">{{ currentShellcodeModeMeta.description }}</p>
          </div>

          <div class="form-group">
            <label>PE 文件</label>
            <div class="path-input-group">
              <input
                type="text"
                :value="shellcodeFilePath"
                class="form-control"
                placeholder="请选择本地 PE 文件（.exe / .dll）..."
                readonly
                @click="triggerShellcodeFileInput"
              >
              <button class="browse-btn" type="button" @click="triggerShellcodeFileInput">选择文件</button>
            </div>
            <p class="help-text">支持的后缀类型: .exe, .dll</p>
          </div>

          <div v-if="needsShellcodeLoaderName" class="form-group">
            <label>Loader 名称</label>
            <input
              v-model="shellcodeLoaderName"
              type="text"
              class="form-control"
              placeholder="请输入导出的 Loader 名称..."
            >
            <p class="help-text">仅 embed 模式需要。默认值为 ReflectiveLoader。</p>
          </div>
        </div>

        <div class="warning-section">
          <span class="icon">🛡️</span>
          <p>{{ warningText }}</p>
        </div>
      </div>

      <div class="modal-footer">
        <input
          ref="shellcodeFileInputRef"
          type="file"
          accept=".exe,.dll"
          style="display: none"
          @change="handleShellcodeFileSelected"
        >
        <button class="btn btn-ghost" @click="modalStore.closeGenerateBeacon()" :disabled="isBusy">
          取消
        </button>
        <button class="btn btn-primary btn-generate" @click="handleGenerate()" :disabled="generateDisabled">
          <span v-if="isBusy" class="loader" :class="{ 'shellcode-loader': isShellcodeMode }"></span>
          <span v-else>{{ primaryButtonLabel }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-container {
  width: 100%;
  max-width: 520px;
  background:
    linear-gradient(180deg, var(--glass-highlight), rgba(255, 255, 255, 0.10) 38%, rgba(255, 255, 255, 0.04)),
    radial-gradient(var(--glass-grain) 0.5px, transparent 0.5px),
    var(--glass-modal-bg);
  background-size: auto, 3px 3px, auto;
  backdrop-filter: blur(var(--glass-blur-lg)) saturate(155%);
  -webkit-backdrop-filter: blur(var(--glass-blur-lg)) saturate(155%);
  border: 1px solid var(--glass-border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.modal-header {
  padding: 24px 24px 16px;
  position: relative;
}

.header-tag {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--color-primary);
  margin-bottom: 4px;
}

h2 {
  margin: 0;
  font-size: 20px;
  color: var(--text-primary);
}

.close-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  background: transparent;
  border: none;
  font-size: 24px;
  color: var(--text-muted);
  cursor: pointer;
}

.modal-body {
  padding: 0 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.info-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--color-primary-dim);
  border-radius: var(--radius-md);
  border: 1px solid rgba(99, 102, 241, 0.2);
  margin-bottom: 24px;
}

.info-banner .icon {
  font-size: 24px;
}

.info-content label {
  display: block;
  font-size: 12px;
  color: var(--color-primary);
  font-weight: 600;
  margin-bottom: 2px;
}

.info-content .value {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.os-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.os-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s;
}

.os-card:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: var(--border);
}

.os-card.active {
  background: var(--color-primary-dim);
  border-color: var(--color-primary);
}

.os-card.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.os-icon {
  font-size: 24px;
}

.os-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.os-card.active .os-label {
  color: var(--color-primary);
}

.form-row {
  display: flex;
  gap: 16px;
  margin-top: 16px;
}

.flex-1 {
  flex: 1;
}

.glass-select {
  width: 100%;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  cursor: pointer;
}

.glass-select:focus {
  border-color: var(--color-primary);
}

.glass-select option {
  background: var(--bg-card);
  color: var(--text-primary);
}

.path-input-group {
  display: flex;
  gap: 12px;
}

.form-control {
  width: 100%;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
}

.form-control:focus {
  border-color: var(--color-primary);
}

.help-text {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.browse-btn {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.74);
  color: var(--text-primary);
  padding: 0 16px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.warning-section {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: rgba(var(--color-primary-rgb), 0.05);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--color-primary);
}

.warning-section p {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}

.internal-hint {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  background: rgba(var(--color-primary-rgb), 0.06);
  border: 1px solid rgba(var(--color-primary-rgb), 0.15);
  border-radius: var(--radius-md);
}

.internal-hint .hint-icon {
  font-size: 20px;
  flex-shrink: 0;
  margin-top: 2px;
}

.internal-hint strong {
  display: block;
  font-size: 13px;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.internal-hint p {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}

.modal-footer {
  padding: 16px 24px 24px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid var(--border-light);
}

.btn-generate {
  min-width: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 600;
}

.loader {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.shellcode-loader {
  border-color: rgba(99, 102, 241, 0.22);
  border-top-color: var(--color-primary);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.animate-slide-up {
  animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
