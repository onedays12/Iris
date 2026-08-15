import { i18n } from '../../i18n/index'

export function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(i18n.global.t('guards.invalidStructure', { label }))
  }
  return value as Record<string, unknown>
}

export function expectArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(i18n.global.t('guards.invalidStructure', { label }))
  }
  return value
}

export function expectStringField(record: Record<string, unknown>, key: string, label: string): string {
  if (typeof record[key] !== 'string') {
    throw new Error(i18n.global.t('guards.invalidField', { label, key }))
  }
  return record[key]
}

export function expectNumberField(record: Record<string, unknown>, key: string, label: string): number {
  if (typeof record[key] !== 'number' || !Number.isFinite(record[key])) {
    throw new Error(i18n.global.t('guards.invalidField', { label, key }))
  }
  return record[key]
}

export function expectBooleanField(record: Record<string, unknown>, key: string, label: string): boolean {
  if (typeof record[key] !== 'boolean') {
    throw new Error(i18n.global.t('guards.invalidField', { label, key }))
  }
  return record[key]
}
