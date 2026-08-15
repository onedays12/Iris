<script setup lang="ts">
/**
 * ExecuteTaskModal - BOF/Shellcode 执行弹窗
 * 配置并执行 Beacon Object File 或 Shellcode，
 * 支持参数输入、文件选择、执行结果回显。
 */

import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Dialogs } from '@wailsio/runtime'
import { sendExecutionBofCommand } from '../../features/beacon/actions/beaconCommandActions'
import { generateShellcode } from '../../features/payload/api/payloadApi'
import type { ShellcodeGenerateRequest, ShellcodeGenerateResult } from '../../features/payload/api/types'
import { useConsoleStore } from '../../stores/console'
import { useNotificationStore } from '../../stores/notification'
import * as FileService from '../../../bindings/irisclient/service/fileservice'
import { openSaveFileDialog } from '../../utils/saveFileDialog'

const { t } = useI18n()
const consoleStore = useConsoleStore()
const notificationStore = useNotificationStore()

const props = defineProps({
  visible: { type: Boolean, default: false },
  beaconid: { type: String, required: true },
  executionType: { type: String, required: true } // 'assembly', 'bof', 'shellcode', 'pe'
})

const emit = defineEmits(['close'])

const filePath = ref('')
const selectedFile = ref<string | null>(null)
const parameters = ref('')
const isExecuting = ref(false)

const titleMap = {
  'assembly': t('executeTask.assemblyTitle'),
  'bof': t('executeTask.bofTitle'),
  'shellcode': t('executeTask.shellcodeTitle'),
  'pe': t('executeTask.peTitle'),
}

const fileFilterMap = {
  'assembly': '.exe, .dll',
  'bof': '.o, .obj',
  'shellcode': '.exe, .dll',
  'pe': '.exe, .dll',
}

const displayTitle = computed(() => titleMap[props.executionType as keyof typeof titleMap] || t('executeTask.defaultTitle'))
const acceptFilter = computed(() => fileFilterMap[props.executionType as keyof typeof fileFilterMap] || '*')
const actionButtonLabel = computed(() => props.executionType === 'shellcode' ? t('executeTask.generateAndSave') : t('executeTask.startExecution'))
const fileInputLabel = computed(() => props.executionType === 'shellcode' ? t('executeTask.shellcodeFileLabel') : t('executeTask.payloadFileLabel'))
const fileInputPlaceholder = computed(() => props.executionType === 'shellcode' ? t('executeTask.shellcodeFilePlaceholder') : t('executeTask.payloadFilePlaceholder'))
const showParametersInput = computed(() => props.executionType !== 'shellcode')
const parsedBofArguments = computed(() => {
  if (props.executionType !== 'bof') return []
  try {
    return parseTypedBofArguments(parameters.value)
  } catch {
    return []
  }
})
const bofArgumentParseError = computed(() => {
  if (props.executionType !== 'bof') return ''
  try {
    parseTypedBofArguments(parameters.value)
    return ''
  } catch (err) {
    return (err instanceof Error ? err.message : String(err)) || t('executeTask.parseArgumentsFailed')
  }
})

const FILE_FILTERS = {
  assembly: { DisplayName: t('executeTask.assemblyFileFilter'), Pattern: '*.exe;*.dll' },
  bof: { DisplayName: t('executeTask.bofFileFilter'), Pattern: '*.o;*.obj' },
  shellcode: { DisplayName: t('executeTask.peFileFilter'), Pattern: '*.exe;*.dll' },
  pe: { DisplayName: t('executeTask.peFileFilter'), Pattern: '*.exe;*.dll' },
}

async function browseFile() {
  try {
    const filter = FILE_FILTERS[props.executionType as keyof typeof FILE_FILTERS] || { DisplayName: t('executeTask.allFilesFilter'), Pattern: '*' }
    const picked = await Dialogs.OpenFile({
      Title: t('executeTask.selectFile'),
      Message: t('executeTask.selectFileMessage', { fileType: filter.DisplayName }),
      CanChooseFiles: true,
      AllowsMultipleSelection: false,
      Filters: [filter],
    })
    const sourcePath = Array.isArray(picked) ? picked[0] : picked
    if (!sourcePath) return
    filePath.value = sourcePath
    selectedFile.value = sourcePath
  } catch (err) {
    notificationStore.error((err instanceof Error ? err.message : String(err)) || t('executeTask.fileSelectionFailed'))
  }
}

function buildShellcodeDefaultName(fileName: string) {
  const sourceName = String(fileName || 'shellcode')
  const trimmed = sourceName.replace(/\.(exe|dll)$/i, '')
  return `${trimmed || 'shellcode'}.bin`
}

function parseBofArguments(input: string) {
  const text = String(input || '')
  const args = []
  let current = ''
  let quote = ''
  let tokenStarted = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]

    if (quote) {
      if (ch === quote) {
        quote = ''
        continue
      }
      if (ch === '\\' && text[i + 1] === quote) {
        current += quote
        i += 1
        continue
      }
      current += ch
      continue
    }

    if (ch === '"' || ch === "'") {
      quote = ch
      tokenStarted = true
      continue
    }

    if (/\s/.test(ch)) {
      if (tokenStarted) {
        args.push(current)
        current = ''
        tokenStarted = false
      }
      continue
    }

    current += ch
    tokenStarted = true
  }

  if (quote) {
    throw new Error(t('executeTask.bofUnclosedQuote', { quote }))
  }
  if (tokenStarted) {
    args.push(current)
  }

  return args
}

function parseInteger(value: string, label: string, min: number, max: number) {
  const text = String(value ?? '').trim()
  if (!text) throw new Error(t('executeTask.parameterRequired', { label }))
  const numeric = Number(text)
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    throw new Error(t('executeTask.parameterIntegerRequired', { label }))
  }
  if (numeric < min || numeric > max) {
    throw new Error(t('executeTask.parameterOutOfRange', { label }))
  }
  return numeric
}

function parseBofArgumentToken(token: string) {
  const text = String(token ?? '')
  const separator = text.indexOf(':')
  if (separator <= 0) {
    return { kind: 'string', value: text }
  }

  const kind = text.slice(0, separator).trim().toLowerCase()
  const value = text.slice(separator + 1)

  switch (kind) {
    case 'int32':
      return { kind: 'int32', value: parseInteger(value, 'int32', -2147483648, 2147483647) }
    case 'short':
    case 'int16':
      return { kind: 'short', value: parseInteger(value, 'short', -32768, 32767) }
    case 'bytes':
      return { kind: 'bytes', value: String(value || '').trim() }
    case 'string':
      return { kind: 'string', value }
    default:
      return { kind: 'string', value: text }
  }
}

function parseTypedBofArguments(input: string) {
  return parseBofArguments(input).map(parseBofArgumentToken)
}

function formatBofPreviewArg(arg: { kind: string; value: string | number }) {
  return `${arg.kind}:${arg.value}`
}

async function executeTask() {
  if (!filePath.value) {
    notificationStore.warn(t('executeTask.filePathRequired'))
    return
  }

  isExecuting.value = true

  if (props.executionType === 'bof') {
    if (!selectedFile.value) {
      notificationStore.warn(t('executeTask.bofFileRequired'))
      isExecuting.value = false
      return
    }

    try {
      // 切换并打开控制台
      consoleStore.openConsole(props.beaconid)

      const displayCommand = `bof "${filePath.value}" ${String(parameters.value || '').trim()}`.trim()
      consoleStore.appendToConsole(props.beaconid, 'input', displayCommand)
      consoleStore.appendToConsole(props.beaconid, 'output', t('executeTask.bofPushing'))

      const artifactData = await FileService.ReadBinaryFileBase64(selectedFile.value)
      const extraArgs = parseTypedBofArguments(parameters.value)
      const args = [{ kind: 'bytes', value: artifactData }, ...extraArgs]

      await sendExecutionBofCommand(props.beaconid, args)
      consoleStore.appendToConsole(props.beaconid, 'output', t('executeTask.injectionCompleted'))
      consoleStore.appendToConsole(props.beaconid, 'output', t('executeTask.interceptedOutput'))
      close()
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)) || t('executeTask.bofExecutionFailed')
      consoleStore.appendToConsole(props.beaconid, 'error', t('executeTask.bofExecutionFailedWithError', { message }))
      notificationStore.error(message)
      console.error('[ExecuteTaskModal] 执行 BOF 失败:', err)
    } finally {
      isExecuting.value = false
    }
    return
  }

  if (props.executionType === 'shellcode') {
    if (!selectedFile.value) {
      notificationStore.warn(t('executeTask.peFileRequired'))
      isExecuting.value = false
      return
    }

    try {
      const peBase64 = await FileService.ReadBinaryFileBase64(selectedFile.value)
      const result = await generateShellcode({
        mode: 'front',
        pe_base64: peBase64,
        loader_name: 'ReflectiveLoader',
      } as unknown as ShellcodeGenerateRequest) as ShellcodeGenerateResult & { message?: string; error?: string }

      const shellcode = result?.shellcode
      if (!shellcode) {
        throw new Error(result?.message || result?.error || t('executeTask.shellcodeGenerationFailed'))
      }

      const savePath = await openSaveFileDialog({
        Title: t('executeTask.saveGeneratedShellcode'),
        Filename: buildShellcodeDefaultName((selectedFile.value as unknown as { name?: string } | null)?.name ?? ''),
        Filters: [
          { DisplayName: 'Shellcode Files', Pattern: '*.bin' }
        ]
      })

      if (!savePath) {
        notificationStore.info(t('executeTask.saveCancelled'))
        return
      }

      await FileService.WriteBinaryFile(savePath, shellcode)
      notificationStore.success(t('executeTask.shellcodeGeneratedSaved'))
      close()
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)) || t('executeTask.shellcodeGenerationError')
      notificationStore.error(message)
      console.error('[ExecuteTaskModal] 生成 Shellcode 失败:', err)
    } finally {
      isExecuting.value = false
    }
    return
  }

  // 其他旧入口保持原先的演示型表现，不影响 BOF 的真实执行链路
  // 切换并打开电话控制台
  consoleStore.openConsole(props.beaconid)

  // 记录下发执行参数指令
  consoleStore.appendToConsole(props.beaconid, 'input',
    `${props.executionType} "${filePath.value}" ${parameters.value}`.trim()
  )
  consoleStore.appendToConsole(props.beaconid, 'output',
    `正在推送 Payload 并准备执行 ${props.executionType}...`
  )

  // 模拟执行完成的系统回调
  setTimeout(() => {
    isExecuting.value = false
    consoleStore.appendToConsole(props.beaconid, 'output',
      `注入成功 / 执行完成。\n截获返回信息: \n\nTarget Agent: ${props.beaconid.substring(0,8)}\nStatus: Payload Execution Simulated Successfully.`
    )
    close()
  }, 1000)
}

watch(() => props.visible, (newVal) => {
  if (newVal) {
    filePath.value = ''
    selectedFile.value = null
    parameters.value = ''
    isExecuting.value = false
  }
})

function close() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
<div class="modal-overlay" v-if="visible">
      <div class="execute-modal">
        <header class="modal-header">
          <div class="header-info">
            <span class="icon">⚡</span>
            <div class="titles">
              <h3>{{ displayTitle }}</h3>
              <span class="subtitle">{{ t('executeTask.targetAgent', { beaconId: beaconid.substring(0,8) }) }}</span>
            </div>
          </div>
          <button class="close-btn" @click="close">×</button>
        </header>

        <div class="modal-body">
          <div class="form-group">
            <label>{{ fileInputLabel }}</label>
            <div class="path-input-group">
              <input 
                type="text" 
                v-model="filePath" 
                class="form-control" 
                :placeholder="fileInputPlaceholder"
              >
              <button class="browse-btn" @click="browseFile">{{ t('executeTask.selectFileButton') }}</button>
            </div>
            <p class="help-text">{{ t('executeTask.supportedExtensions', { extensions: acceptFilter }) }}</p>
          </div>

          <div v-if="showParametersInput" class="form-group">
            <label>{{ t('executeTask.argumentsLabel') }}</label>
            <textarea
              v-model="parameters"
              class="form-control" 
              :class="{ invalid: bofArgumentParseError }"
              rows="3"
              :placeholder="t('executeTask.argumentsPlaceholder')"
            ></textarea>
            <p v-if="executionType === 'bof'" class="help-text">
              {{ t('executeTask.argumentParsingHelp') }}
            </p>
            <p v-if="bofArgumentParseError" class="help-text error">{{ bofArgumentParseError }}</p>
            <div v-if="executionType === 'bof' && parsedBofArguments.length" class="arg-preview">
              <div class="arg-preview-title">{{ t('executeTask.argumentPreview', { count: parsedBofArguments.length }) }}</div>
              <div class="arg-chip-list">
                <span v-for="(arg, index) in parsedBofArguments" :key="index" class="arg-chip">
                  #{{ index + 1 }} {{ formatBofPreviewArg(arg) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <footer class="modal-footer">
          <button class="btn btn-secondary" @click="close" :disabled="isExecuting">{{ t('executeTask.cancel') }}</button>
          <button class="btn btn-danger" @click="executeTask" :disabled="isExecuting || Boolean(bofArgumentParseError)">
            {{ isExecuting ? t('executeTask.executing') : actionButtonLabel }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--bg-overlay); backdrop-filter: blur(4px); display: flex; justify-content: center; align-items: center; z-index: 3000; animation: fadeIn 0.2s ease; }
.execute-modal { width: 640px; background: linear-gradient(180deg, var(--glass-highlight), rgba(255, 255, 255, 0.10) 38%, rgba(255, 255, 255, 0.04)), radial-gradient(var(--glass-grain) 0.5px, transparent 0.5px), var(--glass-modal-bg); background-size: auto, 3px 3px, auto; backdrop-filter: blur(var(--glass-blur-lg)) saturate(155%); -webkit-backdrop-filter: blur(var(--glass-blur-lg)) saturate(155%); border: 1px solid var(--glass-border-strong); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); display: flex; flex-direction: column; overflow: hidden; }

.modal-header { padding: 16px 24px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; background: rgba(255, 255, 255, 0.4); }
.header-info { display: flex; align-items: center; gap: 12px; }
.header-info .icon { font-size: 24px; }
.titles h3 { font-size: 16px; font-weight: 600; color: var(--color-danger); margin: 0; }
.subtitle { font-size: 12px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; }
.close-btn { background: transparent; border: none; font-size: 24px; color: var(--text-muted); cursor: pointer; line-height: 1; padding: 4px; border-radius: 4px; transition: all 0.2s; }
.close-btn:hover { background: rgba(0,0,0,0.05); color: var(--text-primary); }

.modal-body { padding: 24px; display: flex; flex-direction: column; gap: 20px; }
.form-group { display: flex; flex-direction: column; gap: 8px; }
.form-group label { font-size: 13px; font-weight: 500; color: var(--text-secondary); }
.help-text { font-size: 11px; color: var(--text-muted); margin: 0; }

.path-input-group { display: flex; gap: 8px; }
.form-control { flex: 1; padding: 10px 14px; background: rgba(0,0,0,0.03); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); font-size: 13px; transition: border-color 0.2s; }
.form-control:focus { border-color: var(--color-primary); outline: none; }
.form-control[readonly] { cursor: pointer; }
.form-control.invalid { border-color: var(--color-danger); }
textarea.form-control { resize: vertical; min-height: 78px; line-height: 1.5; font-family: 'JetBrains Mono', monospace; }
.help-text.error { color: var(--color-danger); }
.arg-preview { padding: 10px 12px; border: 1px solid var(--border-light); border-radius: 8px; background: rgba(0,0,0,0.025); }
.arg-preview-title { font-size: 11px; color: var(--text-muted); margin-bottom: 8px; }
.arg-chip-list { display: flex; flex-wrap: wrap; gap: 6px; }
.arg-chip { max-width: 100%; padding: 4px 8px; border-radius: 999px; background: rgba(var(--color-primary-rgb), 0.10); color: var(--text-primary); font-family: 'JetBrains Mono', monospace; font-size: 11px; word-break: break-all; }

.browse-btn { padding: 0 16px; background: rgba(0,0,0,0.03); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); cursor: pointer; font-size: 13px; transition: all 0.2s; white-space: nowrap; }
.browse-btn:hover { background: rgba(0,0,0,0.08); }

.modal-footer { padding: 16px 24px; border-top: 1px solid var(--border); background: rgba(0,0,0,0.02); display: flex; justify-content: flex-end; gap: 12px; }
.btn { padding: 8px 20px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; transition: all 0.2s; }
.btn-secondary { background: rgba(0,0,0,0.03); color: var(--text-primary); border: 1px solid var(--border); }
.btn-secondary:hover:not(:disabled) { background: rgba(0,0,0,0.08); }
.btn-danger { background: var(--color-danger); color: white; }
.btn-danger:hover:not(:disabled) { background: #dc2626; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
