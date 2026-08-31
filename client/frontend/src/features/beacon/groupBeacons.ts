import type { Beacon } from './model'

export const UNGROUPED_KEY = ''

export interface BeaconGroup {
  key: string
  agents: Beacon[]
}

export function groupBeacons(agents: Beacon[]): BeaconGroup[] {
  const named = new Map<string, Beacon[]>()
  const ungrouped: Beacon[] = []
  for (const agent of agents) {
    const name = String(agent.groupName || '').trim()
    if (!name) {
      ungrouped.push(agent)
      continue
    }
    const list = named.get(name) || []
    list.push(agent)
    named.set(name, list)
  }
  const out: BeaconGroup[] = []
  if (ungrouped.length) out.push({ key: UNGROUPED_KEY, agents: ungrouped })
  const keys = [...named.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  for (const key of keys) out.push({ key, agents: named.get(key) || [] })
  return out
}

export function uniqueGroupNames(agents: Beacon[]): string[] {
  const names = new Set<string>()
  for (const agent of agents) {
    const name = String(agent.groupName || '').trim()
    if (name) names.add(name)
  }
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
}

export function matchesBeaconSearch(agent: Beacon, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const fields = [
    agent.beaconid,
    agent.hostname,
    agent.username,
    agent.ip,
    agent.externalIp,
    agent.processName,
    agent.os,
    agent.parentId,
    agent.note,
    agent.groupName,
  ]
  return fields.some((value) => String(value || '').toLowerCase().includes(q))
}
