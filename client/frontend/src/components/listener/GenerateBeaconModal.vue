<script setup lang="ts">
/**
 * GenerateBeaconModal - Beacon 生成弹窗
 * 配置并生成 Beacon Payload（可执行文件/DLL/Shellcode），
 * 支持架构、C2 Profile、回调监听器等参数选择。
 */

import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useModalStore } from '../../stores/modal'
import { useListenerStore } from '../../stores/listener'
import { useNotificationStore } from '../../stores/notification'
import { generatePayload, generateShellcode } from '../../features/payload/api/payloadApi'
import type {
  BeaconType,
  PayloadArch,
  PayloadFormat,
  PayloadGenerateRequest,
  PayloadGenerateResult,
  PayloadOs,
  PayloadStageMode,
  ShellcodeGenerateRequest,
  ShellcodeGenerateResult,
} from '../../features/payload/api/types'
import * as FileService from '../../../bindings/irisclient/service/fileservice'
import { openSaveFileDialog } from '../../utils/saveFileDialog'

const { t } = useI18n()
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
const shellcodeFileInputRef = ref<HTMLInputElement | null>(null)
const shellcodeFilePath = ref('')
const shellcodeSelectedFile = ref<File | null>(null)
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
  return String(activeListener.value?.listenerType || activeListenerConfig.value?.listener_type || 'external').toLowerCase()
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

type ArchOption = { value: string; labelKey?: string; label?: string }

const windowsArchOptions: ArchOption[] = [
  { labelKey: 'genBeacon.archAmd64', value: 'amd64' },
  { labelKey: 'genBeacon.archX86', value: 'x86' },
]
// Go-Beacon only supports amd64 on Windows (no x86 template)
const goWindowsArchOptions: ArchOption[] = [
  { labelKey: 'genBeacon.archAmd64', value: 'amd64' },
]
const linuxArchOptions: ArchOption[] = [
  { labelKey: 'genBeacon.archAmd64', value: 'amd64' },
]
const macArchOptions: ArchOption[] = [
  { label: 'arm (Apple Silicon)', value: 'arm' },
]

const generationModeOptions = [
  { labelKey: 'genBeacon.modeBeacon', value: 'beacon' },
  { labelKey: 'genBeacon.modeShellcode', value: 'shellcode' },
]
const stageModeOptions = [
  { labelKey: 'genBeacon.stageStagerless', value: 'stagerless', descriptionKey: 'genBeacon.stageStagerlessDesc' },
  { labelKey: 'genBeacon.stageStager', value: 'stager', descriptionKey: 'genBeacon.stageStagerDesc' },
]
const beaconTypeOptions = [
  { labelKey: 'genBeacon.goBeacon', value: 'go', descriptionKey: 'genBeacon.goBeaconDesc' },
  { labelKey: 'genBeacon.cBeacon', value: 'c', descriptionKey: 'genBeacon.cBeaconDesc' },
]
const shellcodeModeOptions: { labelKey: string; value: string; descriptionKey: string; label?: string }[] = [
  { labelKey: 'genBeacon.shellcodeFront', value: 'front', descriptionKey: 'genBeacon.shellcodeFrontDesc' },
  { labelKey: 'genBeacon.shellcodePost', value: 'post', descriptionKey: 'genBeacon.shellcodePostDesc' },
  { labelKey: 'genBeacon.shellcodeEmbed', value: 'embed', descriptionKey: 'genBeacon.shellcodeEmbedDesc' },
]

const isInternal = computed(() => activeListenerType.value === 'internal')

// External TCP listener: Go-Beacon is explicitly rejected by the server
const isExternalTcp = computed(() =>
  activeListenerType.value === 'external' && activeListenerProtocol.value === 'tcp'
)
// Go-Beacon + External TCP = blocked combination
const isGoTcpBlocked = computed(() =>
  beaconType.value === 'go' && isExternalTcp.value && stageMode.value !== 'stager'
)

const isShellcodeMode = computed(() => generationMode.value === 'shellcode')
const needsShellcodeLoaderName = computed(() => shellcodeMode.value === 'embed')
const currentShellcodeModeMeta = computed(() => {
  return shellcodeModeOptions.find(item => item.value === shellcodeMode.value) || shellcodeModeOptions[0]
})
const currentStageModeMeta = computed(() => {
  return stageModeOptions.find(item => item.value === stageMode.value) || stageModeOptions[0]
})
const availableArchOptions = computed(() => {
  if (isInternal.value || stageMode.value === 'stager') {
    // Internal and stager lock to windows; Go-Beacon still only amd64
    return beaconType.value === 'go' ? goWindowsArchOptions : windowsArchOptions
  }
  if (os.value === 'mac') return macArchOptions
  if (os.value === 'linux') return linuxArchOptions
  // Windows external
  return beaconType.value === 'go' ? goWindowsArchOptions : windowsArchOptions
})
const availableStageModeOptions = computed(() => {
  return stageModeOptions.map(item => ({
    ...item,
    disabled: item.value === 'stager' && (os.value !== 'windows' || isInternal.value),
  }))
})
const availableBeaconTypes = computed<{ value: string; label?: string; labelKey?: string; descriptionKey?: string; description?: string }[]>(() => {
  // External TCP: server explicitly rejects Go-Beacon
  if (isExternalTcp.value) {
    return [{ label: 'C-Beacon', value: 'c', descriptionKey: 'genBeacon.extTcpNoGo' }]
  }
  // Mac/Linux: Go-Beacon only
  if (os.value === 'mac' || os.value === 'linux') {
    return [{ label: 'Go-Beacon', value: 'go', descriptionKey: 'genBeacon.currentOsFixed' }]
  }
  // Windows (external HTTP, internal TCP/SMB): both available
  return beaconTypeOptions
})

function beaconTypeHint(bt: { descriptionKey?: string; description?: string } | undefined): string {
  if (!bt) return ''
  return bt.descriptionKey ? t(bt.descriptionKey) : (bt.description ?? '')
}
const modalTitle = computed(() => isShellcodeMode.value ? t('genBeacon.titleShellcode') : t('genBeacon.titleBeacon'))
const primaryButtonLabel = computed(() => {
  if (isShellcodeMode.value) {
    return generatingShellcode.value ? t('genBeacon.generating') : t('genBeacon.generateAndSave')
  }
  return generating.value ? t('genBeacon.compiling') : t('genBeacon.compileAndSave')
})
const isBusy = computed(() => generating.value || generatingShellcode.value)
const canGenerateBeacon = computed(() => {
  if (!activeListener.value) return false
  if (activeListenerStatus.value !== 'started') return false
  if (stageMode.value !== 'stager') return true
  return os.value === 'windows' && activeListenerSupportsHttpStager.value
})
const generateDisabled = computed(() => {
  return isBusy.value || isGoTcpBlocked.value
})
const warningText = computed(() => {
  if (isShellcodeMode.value) {
    return t('genBeacon.warnShellcode', { mode: t(currentShellcodeModeMeta.value.labelKey || currentShellcodeModeMeta.value.label || '') })
  }
  // Go-Beacon + External TCP: server will reject
  if (isGoTcpBlocked.value) {
    return t('genBeacon.warnGoTcpBlocked')
  }
  if (isInternal.value) {
    if (beaconType.value === 'go') {
      return t('genBeacon.warnInternalGo')
    }
    return t('genBeacon.warnInternalC')
  }
  if (activeListener.value && activeListenerStatus.value !== 'started') {
    return t('genBeacon.warnListenerNotStarted')
  }
  if (stageMode.value === 'stager') {
    if (os.value !== 'windows') {
      return t('genBeacon.warnStagerOnlyWin')
    }
    if (!activeListenerSupportsHttpStager.value) {
      if (!['http', 'https'].includes(activeListenerProtocol.value) || activeListenerType.value !== 'external') {
        return t('genBeacon.warnStagerNeedsHttp')
      }
      if (!activeListenerStagerEnabled.value) {
        return t('genBeacon.warnStagerNotEnabled')
      }
      return t('genBeacon.warnStagerMissingEndpoint')
    }
    if (arch.value === 'x86') {
      return t('genBeacon.warnStagerX86')
    }
    if (format.value === 'c') {
      return t('genBeacon.warnStagerCFormat')
    }
    return t('genBeacon.warnStagerGeneral')
  }
  return t('genBeacon.warnDefault')
})

// 根据 OS、Beacon 类型和 Stage 模式动态计算可用格式
const availableFormats = computed(() => {
  if (stageMode.value === 'stager') {
    return [
      { label: 'Executable (.exe)', value: 'exe' },
      { label: 'Shellcode (.bin)', value: 'bin' },
      { label: 'C Array Source (.c)', value: 'c' },
    ]
  }
  if (isInternal.value) {
    return [{ label: 'Executable (.exe)', value: 'exe' }]
  }
  // Go-Beacon: exe only，无 DLL 模板
  if (beaconType.value === 'go') {
    switch (os.value) {
      case 'linux': return [{ label: 'ELF Executable', value: 'elf' }]
      case 'mac':   return [{ label: 'Mach-O Executable', value: 'macho' }]
      default:      return [{ label: 'Executable (.exe)', value: 'exe' }]
    }
  }
  // C-Beacon: exe + dll + shellcode
  switch (os.value) {
    case 'windows': return [
      { label: 'Executable (.exe)', value: 'exe' },
      { label: 'DLL (.dll)', value: 'dll' },
      { label: 'Shellcode (.bin)', value: 'bin' },
    ]
    case 'linux': return [{ label: 'ELF Executable', value: 'elf' }]
    case 'mac':   return [{ label: 'Mach-O Executable', value: 'macho' }]
    default:      return [{ label: 'Executable (.exe)', value: 'exe' }]
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

// Internal listener: lock OS/arch/format/stageMode, but allow both beacon types
watch(isInternal, (val) => {
  if (val) {
    os.value = 'windows'
    arch.value = 'amd64'
    format.value = 'exe'
    stageMode.value = 'stagerless'
  }
}, { immediate: true })

// C-Beacon: only valid on Windows
// Go-Beacon: x86 not supported, auto-switch to amd64
watch(beaconType, (type) => {
  if (type === 'c') {
    if (os.value === 'mac' || os.value === 'linux') os.value = 'windows'
  } else if (type === 'go') {
    if (arch.value === 'x86') arch.value = 'amd64'
  }
})

// Auto-reset format when it becomes unavailable after beacon type / OS change
watch(availableFormats, (newFormats) => {
  if (!newFormats.some(f => f.value === format.value)) {
    format.value = newFormats[0]?.value || 'exe'
  }
})

// Auto-reset arch when it becomes unavailable (e.g. switch to Go-Beacon removes x86)
watch(availableArchOptions, (newOpts) => {
  if (!newOpts.some(a => a.value === arch.value)) {
    arch.value = newOpts[0]?.value || 'amd64'
  }
})

// Auto-reset beaconType when it becomes unavailable (e.g. switch to external TCP removes Go)
watch(availableBeaconTypes, (newTypes) => {
  if (!newTypes.some(bt => bt.value === beaconType.value)) {
    beaconType.value = newTypes[0]?.value || 'c'
  }
})

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = () => reject(reader.error || new Error(t('genBeacon.readLocalFailed')))
    reader.readAsDataURL(file)
  })
}

function buildShellcodeDefaultName(fileName: string) {
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

async function generateShellcodeFromFile(file: File) {
  generatingShellcode.value = true
  try {
    const peBase64 = await readFileAsBase64(file)
    const result = await generateShellcode({
      mode: shellcodeMode.value as 'front' | 'post' | 'embed',
      pe_base64: peBase64,
      loader_name: needsShellcodeLoaderName.value
        ? String(shellcodeLoaderName.value || 'ReflectiveLoader')
        : undefined,
    } as unknown as ShellcodeGenerateRequest) as ShellcodeGenerateResult & { message?: string; error?: string }

    // 契约: request() 已解包 {ok, data} 信封, shellcode 为顶层字段
    const shellcode = result?.shellcode
    if (!shellcode) {
      throw new Error(result?.message || result?.error || t('genBeacon.shellcodeGenFailed'))
    }

    const savePath = await openSaveFileDialog({
      Title: t('genBeacon.saveShellcodeTitle'),
      Filename: buildShellcodeDefaultName(file?.name),
      Filters: [
        { DisplayName: 'Shellcode Files', Pattern: '*.bin' }
      ]
    })

    if (!savePath) {
      notificationStore.info(t('genBeacon.cancelSave'))
      return
    }

    await FileService.WriteBinaryFile(savePath, shellcode)
    notificationStore.success(t('genBeacon.shellcodeSaved'))
  } catch (err) {
    console.error('Shellcode generation failed:', err)
    notificationStore.error(t('genBeacon.shellcodeGenError', { message: err instanceof Error ? err.message : String(err) }))
  } finally {
    generatingShellcode.value = false
  }
}

async function handleShellcodeFileSelected(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file) return
  shellcodeSelectedFile.value = file
  shellcodeFilePath.value = file.name
}

async function handleGenerateShellcode() {
  if (!shellcodeSelectedFile.value) {
    notificationStore.warn(t('genBeacon.selectPeFirst'))
    return
  }

  await generateShellcodeFromFile(shellcodeSelectedFile.value)
}

async function handleGenerateBeacon() {
  if (!activeListener.value) {
    notificationStore.warn(t('genBeacon.selectListener'))
    return
  }
  if (activeListenerStatus.value !== 'started') {
    notificationStore.warn(t('genBeacon.listenerNotStarted'))
    return
  }
  // Go-Beacon does not support External TCP listeners
  if (beaconType.value === 'go' && isExternalTcp.value) {
    notificationStore.warn(t('genBeacon.goNotSupported'))
    return
  }

  if (stageMode.value === 'stager') {
    if (os.value !== 'windows') {
      notificationStore.warn(t('genBeacon.stagerOnlyWinWarn'))
      return
    }
    if (!activeListenerSupportsHttpStager.value) {
      if (!['http', 'https'].includes(activeListenerProtocol.value) || activeListenerType.value !== 'external') {
        notificationStore.warn(t('genBeacon.warnStagerNeedsHttp'))
        return
      }
      if (!activeListenerStagerEnabled.value) {
        notificationStore.warn(t('genBeacon.warnStagerNotEnabledWarn'))
        return
      }
      notificationStore.warn(t('genBeacon.warnStagerMissingEndpointWarn'))
      return
    }
  } else if (format.value === 'c') {
    notificationStore.warn(t('genBeacon.cFormatStagerOnly'))
    return
  }

  generating.value = true
  try {
    // 1. 调用后端生成 Payload
    const payloadParams: PayloadGenerateRequest = {
      listener_id: activeListener.value.id,
      os: os.value as PayloadOs,
      arch: arch.value as PayloadArch,
      format: format.value as PayloadFormat,
      stage_mode: stageMode.value as PayloadStageMode,
    }
    if (stageMode.value !== 'stager') {
      payloadParams.beacon_type = beaconType.value as BeaconType
    }
    const result = await generatePayload(payloadParams) as PayloadGenerateResult & { message?: string; error?: string }

    const payload = result?.payload
    if (!payload) {
      throw new Error(result?.message || result?.error || t('genBeacon.genFailed'))
    }

    // 2. 弹出系统保存对话框
    const ext = format.value === 'c' ? 'c' : format.value
    const responseFileName = result?.file_name ?? ''
    const defaultName = responseFileName || `${stageMode.value === 'stager' ? 'stager' : 'beacon'}_${os.value}_${arch.value}_${activeListener.value.name}.${ext}`
    const filterName = format.value === 'c' ? 'C Source Files' : 'Payload Files'
    
    const savePath = await openSaveFileDialog({
      Title: t('genBeacon.saveTitle', { mode: stageMode.value === 'stager' ? t('genBeacon.stager') : t('genBeacon.beacon') }),
      Filename: defaultName,
      Filters: [
        { DisplayName: filterName, Pattern: `*.${ext}` }
      ]
    })

    if (!savePath) {
      notificationStore.info(t('genBeacon.cancelSave'))
      return
    }

    // 3. 写入文件
    await FileService.WriteBinaryFile(savePath, payload)

    const responseStageMode = result?.stage_mode ?? stageMode.value
    const stageId = result?.stage_id ?? ''
    const stageUrl = result?.stage_url ?? ''
    notificationStore.success(
      stageUrl
        ? t('genBeacon.stagerSavedWithStage', { format: format.value === 'c' ? 'C' : '', stageId: stageId || '-', stageUrl })
        : t('genBeacon.beaconSaved', { stageMode: responseStageMode })
    )
    modalStore.closeGenerateBeacon()
  } catch (err) {
    console.error('Payload generation failed:', err)
    notificationStore.error(t('genBeacon.genFailedError', { message: err instanceof Error ? err.message : String(err) }))
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
          <label>{{ t('genBeacon.fieldGenType') }}</label>
          <select v-model="generationMode" class="glass-select">
            <option v-for="item in generationModeOptions" :key="item.value" :value="item.value">{{ t(item.labelKey) }}</option>
          </select>
        </div>

        <!-- 监听器信息 -->
        <div class="info-banner" v-if="!isShellcodeMode && activeListener">
          <span class="icon">📡</span>
          <div class="info-content">
            <label>{{ t('genBeacon.targetListener') }}</label>
            <div class="value">{{ activeListener.name }} ({{ activeListener.protocol.toUpperCase() }})</div>
          </div>
        </div>

        <div v-if="!isShellcodeMode" class="config-sections">
          <!-- 维度 1: 操作系统 -->
          <div class="form-group">
            <label>{{ t('genBeacon.fieldOs') }}</label>
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
              <label>{{ t('genBeacon.fieldArch') }}</label>
              <select v-model="arch" class="glass-select" :disabled="availableArchOptions.length === 1">
                <option v-for="a in availableArchOptions" :key="a.value" :value="a.value">{{ a.labelKey ? t(a.labelKey) : a.label }}</option>
              </select>
            </div>

            <!-- 维度 3: 输出格式 -->
            <div class="form-group flex-1">
              <label>{{ t('genBeacon.fieldFormat') }}</label>
              <select v-model="format" class="glass-select" :disabled="availableFormats.length === 1">
                <option v-for="f in availableFormats" :key="f.value" :value="f.value">{{ f.label }}</option>
              </select>
            </div>

            <!-- 维度 4: Beacon 类型 -->
            <div v-if="stageMode !== 'stager'" class="form-group flex-1">
              <label>{{ t('genBeacon.fieldBeaconType') }}</label>
              <select v-model="beaconType" class="glass-select" :disabled="availableBeaconTypes.length === 1">
                <option v-for="bt in availableBeaconTypes" :key="bt.value" :value="bt.value">{{ bt.labelKey ? t(bt.labelKey) : bt.label }}</option>
              </select>
              <p class="field-hint">{{ beaconTypeHint(availableBeaconTypes.find(bt => bt.value === beaconType)) }}</p>
            </div>
          </div>

          <div v-if="isInternal" class="internal-hint">
            <span class="hint-icon">🔗</span>
            <div>
              <strong>{{ t('genBeacon.cascadeInternalBeacon') }}</strong>
              <p v-if="beaconType === 'go'">{{ t('genBeacon.internalGoDetail') }}</p>
              <p v-else>{{ t('genBeacon.internalCDetail') }}</p>
            </div>
          </div>
          <div v-if="isGoTcpBlocked" class="internal-hint go-tcp-blocked">
            <span class="hint-icon">⛔</span>
            <div>
              <strong>{{ t('genBeacon.goNoExtTcpTitle') }}</strong>
              <p>{{ t('genBeacon.goNoExtTcpDesc') }}</p>
            </div>
          </div>
          <div v-if="!isInternal && os === 'mac'" class="internal-hint">
            <span class="hint-icon">🍎</span>
            <div>
              <strong>{{ t('genBeacon.macBeaconTitle') }}</strong>
              <p>{{ t('genBeacon.macBeaconDesc') }}</p>
            </div>
          </div>
          <div v-if="!isInternal && os === 'linux'" class="internal-hint">
            <span class="hint-icon">🐧</span>
            <div>
              <strong>{{ t('genBeacon.linuxBeaconTitle') }}</strong>
              <p>{{ t('genBeacon.linuxBeaconDesc') }}</p>
            </div>
          </div>

          <div v-if="!isInternal" class="form-group stage-mode-group">
            <label>{{ t('genBeacon.fieldStageMode') }}</label>
            <select v-model="stageMode" class="glass-select">
              <option
                v-for="item in availableStageModeOptions"
                :key="item.value"
                :value="item.value"
                :disabled="item.disabled"
              >
                {{ t(item.labelKey) }}
              </option>
            </select>
            <p class="help-text">{{ t(currentStageModeMeta.descriptionKey) }}</p>
            <p v-if="stageMode === 'stager' && !activeListenerStagerEnabled" class="help-text warning-text">
              {{ t('genBeacon.warnStagerNotEnabledWarn') }}
            </p>
            <p v-else-if="stageMode === 'stager' && !activeListenerSupportsHttpStager" class="help-text warning-text">
              {{ t('genBeacon.stagerNeedsHttpListener') }}
            </p>
          </div>
        </div>

        <div v-else class="config-sections">
          <div class="form-group">
            <label>{{ t('genBeacon.fieldShellcodeMode') }}</label>
            <select v-model="shellcodeMode" class="glass-select">
              <option v-for="item in shellcodeModeOptions" :key="item.value" :value="item.value">{{ t(item.labelKey) }}</option>
            </select>
            <p class="help-text">{{ t(currentShellcodeModeMeta.descriptionKey) }}</p>
          </div>

          <div class="form-group">
            <label>{{ t('genBeacon.fieldPeFile') }}</label>
            <div class="path-input-group">
              <input
                type="text"
                :value="shellcodeFilePath"
                class="form-control"
                :placeholder="t('genBeacon.pePlaceholder')"
                readonly
                @click="triggerShellcodeFileInput"
              >
              <button class="browse-btn" type="button" @click="triggerShellcodeFileInput">{{ t('genBeacon.chooseFile') }}</button>
            </div>
            <p class="help-text">{{ t('genBeacon.supportedExts') }}</p>
          </div>

          <div v-if="needsShellcodeLoaderName" class="form-group">
            <label>{{ t('genBeacon.fieldLoaderName') }}</label>
            <input
              v-model="shellcodeLoaderName"
              type="text"
              class="form-control"
              :placeholder="t('genBeacon.loaderPlaceholder')"
            >
            <p class="help-text">{{ t('genBeacon.loaderHint') }}</p>
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
          {{ t('common.cancel') }}
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

.go-tcp-blocked {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.35);
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
