<script setup>
/**
 * ExecuteTaskModal - BOF/Shellcode 执行弹窗
 * 配置并执行 Beacon Object File 或 Shellcode，
 * 支持参数输入、文件选择、执行结果回显。
 */

import { ref, computed, watch } from 'vue'
import { sendExecutionBofCommand } from '../../features/beacon/actions/beaconCommandActions.js'
import { generateShellcode } from '../../features/payload/api/payloadApi.js'
import { useConsoleStore } from '../../stores/console.js'
import { useNotificationStore } from '../../stores/notification.js'
import * as FileService from '../../../bindings/irisclient/service/fileservice.js'
import { Dialogs } from '@wailsio/runtime'

const consoleStore = useConsoleStore()
const notificationStore = useNotificationStore()

const props = defineProps({
  visible: { type: Boolean, default: false },
  beaconid: { type: String, required: true },
  executionType: { type: String, required: true } // 'assembly', 'bof', 'shellcode', 'pe'
})

const emit = defineEmits(['close'])

const filePath = ref('')
const selectedFile = ref(null)
const parameters = ref('')
const isExecuting = ref(false)

const titleMap = {
  'assembly': '执行 .NET Assembly (execute-assembly)',
  'bof': '执行 Beacon Object File (execute-bof)',
  'shellcode': '生成 Shellcode (payload/shellcode)',
  'pe': '执行 PE 文件 (execute-pe)'
}

const fileFilterMap = {
  'assembly': '.exe, .dll',
  'bof': '.o, .obj',
  'shellcode': '.exe, .dll',
  'pe': '.exe, .dll'
}

const displayTitle = computed(() => titleMap[props.executionType] || '执行任务')
const acceptFilter = computed(() => fileFilterMap[props.executionType] || '*')
const actionButtonLabel = computed(() => props.executionType === 'shellcode' ? '生成并保存' : '发起执行 🚀')
const fileInputLabel = computed(() => props.executionType === 'shellcode' ? '待转换 PE 文件 (Host Local Path)' : '待执行文件载荷路径 (Host Local Path)')
const fileInputPlaceholder = computed(() => props.executionType === 'shellcode' ? '请选择本地 PE 文件，发送给后端生成 shellcode...' : '请选择或输入本地 Payload 文件路径...')
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
    return err?.message || '参数解析失败'
  }
})

const FILE_FILTERS = {
  assembly: { DisplayName: 'Assembly 文件', Pattern: '*.exe;*.dll' },
  bof: { DisplayName: 'BOF 文件', Pattern: '*.o;*.obj' },
  shellcode: { DisplayName: 'PE 文件', Pattern: '*.exe;*.dll' },
  pe: { DisplayName: 'PE 文件', Pattern: '*.exe;*.dll' },
}

async function browseFile() {
  try {
    const filter = FILE_FILTERS[props.executionType] || { DisplayName: '所有文件', Pattern: '*' }
    const picked = await Dialogs.OpenFile({
      Title: '选择文件',
      Message: `请选择 ${filter.DisplayName}`,
      CanChooseFiles: true,
      AllowsMultipleSelection: false,
      Filters: [filter],
    })
    const sourcePath = Array.isArray(picked) ? picked[0] : picked
    if (!sourcePath) return
    filePath.value = sourcePath
    selectedFile.value = sourcePath
  } catch (err) {
    notificationStore.error(err.message || '文件选择失败')
  }
}

function buildShellcodeDefaultName(fileName) {
  const sourceName = String(fileName || 'shellcode')
  const trimmed = sourceName.replace(/\.(exe|dll)$/i, '')
  return `${trimmed || 'shellcode'}.bin`
}

function parseBofArguments(input) {
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
    throw new Error(`BOF 参数存在未闭合的 ${quote} 引号`)
  }
  if (tokenStarted) {
    args.push(current)
  }

  return args
}

function parseInteger(value, label, min, max) {
  const text = String(value ?? '').trim()
  if (!text) throw new Error(`${label} 不能为空`)
  const numeric = Number(text)
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    throw new Error(`${label} 必须是整数`)
  }
  if (numeric < min || numeric > max) {
    throw new Error(`${label} 超出范围`)
  }
  return numeric
}

function parseBofArgumentToken(token) {
  const text = String(token ?? '')
  const separator = text.indexOf(':')
  if (separator <= 0) {
    return { kind: 'string', value: text }
  }

  const kind = text.slice(0, separator).trim().toLowerCase()
  const value = text.slice(separator + 1)

  switch (kind) {
    case 'int32':
      return { kind: 'int32', value: parseInteger(value, 'int32 参数', -2147483648, 2147483647) }
    case 'short':
    case 'int16':
      return { kind: 'short', value: parseInteger(value, 'short 参数', -32768, 32767) }
    case 'bytes':
      return { kind: 'bytes', value: String(value || '').trim() }
    case 'string':
      return { kind: 'string', value }
    default:
      return { kind: 'string', value: text }
  }
}

function parseTypedBofArguments(input) {
  return parseBofArguments(input).map(parseBofArgumentToken)
}

function formatBofPreviewArg(arg) {
  return `${arg.kind}:${arg.value}`
}

async function executeTask() {
  if (!filePath.value) {
    notificationStore.warn('请先选择待执行的文件路径')
    return
  }

  isExecuting.value = true

  if (props.executionType === 'bof') {
    if (!selectedFile.value) {
      notificationStore.warn('请先选择待执行的 BOF / OBJ 文件')
      isExecuting.value = false
      return
    }

    try {
      // 切换并打开控制台
      consoleStore.openConsole(props.beaconid)

      const displayCommand = `bof "${filePath.value}" ${String(parameters.value || '').trim()}`.trim()
      consoleStore.appendToConsole(props.beaconid, 'input', displayCommand)
      consoleStore.appendToConsole(props.beaconid, 'output', '正在推送 BOF 工件并准备执行...')

      const artifactData = await FileService.ReadBinaryFileBase64(selectedFile.value)
      const extraArgs = parseTypedBofArguments(parameters.value)
      const args = [{ kind: 'bytes', value: artifactData }, ...extraArgs]

      await sendExecutionBofCommand(props.beaconid, args)
      consoleStore.appendToConsole(props.beaconid, 'output', '注入成功 / 执行完成。')
      consoleStore.appendToConsole(props.beaconid, 'output', '截获返回信息:')
      close()
    } catch (err) {
      const message = err?.message || '执行 BOF 失败'
      consoleStore.appendToConsole(props.beaconid, 'error', `BOF 执行失败: ${message}`)
      notificationStore.error(message)
      console.error('[ExecuteTaskModal] 执行 BOF 失败:', err)
    } finally {
      isExecuting.value = false
    }
    return
  }

  if (props.executionType === 'shellcode') {
    if (!selectedFile.value) {
      notificationStore.warn('请先选择待转换的 PE 文件')
      isExecuting.value = false
      return
    }

    try {
      const peBase64 = await FileService.ReadBinaryFileBase64(selectedFile.value)
      const result = await generateShellcode({
        mode: 'front',
        pe_base64: peBase64,
        loader_name: 'ReflectiveLoader',
      })

      const shellcode = result?.shellcode ?? result?.data?.shellcode
      if (!shellcode) {
        throw new Error(result?.message || result?.error || 'shellcode 生成失败')
      }

      const savePath = await Dialogs.SaveFile({
        Title: '保存生成的 Shellcode',
        Filename: buildShellcodeDefaultName(selectedFile.value?.name),
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
      close()
    } catch (err) {
      const message = err?.message || '生成 Shellcode 失败'
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
              <span class="subtitle">目标 Agent: {{ beaconid.substring(0,8) }}</span>
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
              <button class="browse-btn" @click="browseFile">选择文件</button>
            </div>
            <p class="help-text">支持的后缀类型: {{ acceptFilter }}</p>
          </div>

          <div v-if="showParametersInput" class="form-group">
            <label>执行参数 (Arguments / Optional)</label>
            <textarea
              v-model="parameters"
              class="form-control" 
              :class="{ invalid: bofArgumentParseError }"
              rows="3"
              placeholder='BOF 参数按空格分隔；类型用 kind:value。例如：int32:1234 short:77 "hello-elf-bof"'
            ></textarea>
            <p v-if="executionType === 'bof'" class="help-text">
              BOF 参数会按 shell-like 规则拆分；支持 int32、short/int16、string、bytes 前缀，未带前缀时按 string 发送。
            </p>
            <p v-if="bofArgumentParseError" class="help-text error">{{ bofArgumentParseError }}</p>
            <div v-if="executionType === 'bof' && parsedBofArguments.length" class="arg-preview">
              <div class="arg-preview-title">解析预览：{{ parsedBofArguments.length }} 个参数</div>
              <div class="arg-chip-list">
                <span v-for="(arg, index) in parsedBofArguments" :key="index" class="arg-chip">
                  #{{ index + 1 }} {{ formatBofPreviewArg(arg) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <footer class="modal-footer">
          <button class="btn btn-secondary" @click="close" :disabled="isExecuting">取消</button>
          <button class="btn btn-danger" @click="executeTask" :disabled="isExecuting || Boolean(bofArgumentParseError)">
            {{ isExecuting ? '执行中...' : actionButtonLabel }}
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
