/**
 * Topology cascade level is graph hop-count from the nearest root.
 * Visual Y (including user drag) must not invent extra cascade rows.
 */

export type TopologyAgent = {
  beaconid?: string
  parentId?: string
  listenerType?: string
  depth?: number | string
}

export type TopologyPosition = {
  x: number
  y: number
}

export type BeaconLayerRow = {
  key: string
  y: number
  label: string
  summary: string
  kind: 'external' | 'cascade'
  height: number
}

export function resolveParentId(agent: TopologyAgent, agents: TopologyAgent[]): string {
  const parentId = String(agent.parentId || '')
  if (!parentId) return ''
  const selfId = String(agent.beaconid || '')
  const parent = agents.find((item) => {
    const id = String(item.beaconid || '')
    if (!id || id === selfId) return false
    return id === parentId || id.startsWith(parentId) || parentId.startsWith(id)
  })
  return parent?.beaconid ? String(parent.beaconid) : ''
}

export function isCascadeLike(agent: TopologyAgent): boolean {
  const listenerType = String(agent.listenerType || '').toLowerCase()
  const depth = Number(agent.depth || 0)
  return listenerType === 'internal' || depth > 0 || Boolean(agent.parentId)
}

export function getCascadeDepth(agent: TopologyAgent, agents: TopologyAgent[]): number {
  let current: TopologyAgent | undefined = agent
  let hops = 0
  const visited = new Set<string>()

  while (current) {
    const parentId = resolveParentId(current, agents)
    if (!parentId) {
      const rootDepth = isCascadeLike(current) ? 1 : 0
      return rootDepth + hops
    }

    const id = String(current.beaconid || '')
    if (visited.has(id)) return Math.max(hops, 1)
    visited.add(id)

    hops += 1
    current = agents.find((item) => String(item.beaconid || '') === parentId)
    if (!current) return hops
  }

  return hops
}

export function buildBeaconLayerRows(
  agents: TopologyAgent[],
  positions: Record<string, TopologyPosition | undefined>,
  nodeH = 104,
): BeaconLayerRow[] {
  const depthGroups = new Map<number, number[]>()

  for (const agent of agents) {
    const id = String(agent.beaconid || '')
    const pos = positions[id]
    if (!pos) continue
    const depth = getCascadeDepth(agent, agents)
    const ys = depthGroups.get(depth)
    if (ys) ys.push(pos.y)
    else depthGroups.set(depth, [pos.y])
  }

  const rows: BeaconLayerRow[] = []
  const depths = [...depthGroups.keys()].sort((a, b) => a - b)
  for (const depth of depths) {
    const ys = depthGroups.get(depth) || []
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const isExternal = depth === 0
    rows.push({
      key: isExternal ? 'external' : `cascade-${depth}`,
      y: (minY + maxY) / 2,
      label: isExternal ? 'External Beacons' : `Cascade Level ${depth}`,
      summary: `${ys.length} node${ys.length > 1 ? 's' : ''}`,
      kind: isExternal ? 'external' : 'cascade',
      height: Math.max(nodeH + 58, maxY - minY + nodeH + 58),
    })
  }

  return rows
}
