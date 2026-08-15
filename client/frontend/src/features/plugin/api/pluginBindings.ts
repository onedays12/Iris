import * as PluginService from '../../../../bindings/irisclient/service/pluginservice'

export async function listPluginSnapshots(): Promise<unknown> {
  return PluginService.ListPlugins()
}

export async function reloadPluginSnapshots(): Promise<unknown> {
  return PluginService.ReloadPlugins()
}

export async function addPluginFromPath(pluginPath: string): Promise<unknown> {
  return PluginService.AddPlugin(pluginPath)
}

export async function deletePluginById(pluginId: string): Promise<unknown> {
  return PluginService.DeletePlugin(pluginId)
}

export async function invokePlugin(
  pluginId: string,
  action: string,
  payloadJSON: string,
): Promise<unknown> {
  return PluginService.InvokePluginAction(pluginId, action, payloadJSON)
}
