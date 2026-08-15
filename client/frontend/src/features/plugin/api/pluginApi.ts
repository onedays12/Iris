import { expectArray, expectRecord, expectStringField } from '../../../shared/api/guards'
import {
  addPluginFromPath,
  deletePluginById,
  invokePlugin,
  listPluginSnapshots,
  reloadPluginSnapshots,
} from './pluginBindings'
import type { PluginSnapshotDto } from './types'

function parsePlugin(value: unknown): PluginSnapshotDto {
  const record = expectRecord(value, 'Plugin')
  expectStringField(record, 'id', 'Plugin')
  return record as unknown as PluginSnapshotDto
}

function parsePluginList(value: unknown): PluginSnapshotDto[] {
  return expectArray(value, 'Plugin list').map(parsePlugin)
}

export async function listPlugins(): Promise<PluginSnapshotDto[]> {
  return parsePluginList(await listPluginSnapshots())
}

export async function reloadPlugins(): Promise<PluginSnapshotDto[]> {
  return parsePluginList(await reloadPluginSnapshots())
}

export async function addPlugin(pluginPath: string): Promise<PluginSnapshotDto[]> {
  return parsePluginList(await addPluginFromPath(pluginPath))
}

export async function deletePlugin(pluginId: string): Promise<PluginSnapshotDto[]> {
  return parsePluginList(await deletePluginById(pluginId))
}

export async function invokePluginAction(
  pluginId: string,
  action: string,
  payloadJSON = '',
): Promise<PluginSnapshotDto> {
  return parsePlugin(await invokePlugin(pluginId, action, payloadJSON))
}
