import { describe, expect, it } from 'vitest'
import {
  buildBeaconLayerRows,
  getCascadeDepth,
} from '../../src/features/topology/cascadeLayout'

function parentWithTwoChildren() {
  return [
    { beaconid: 'parent', listenerType: 'external' },
    { beaconid: 'child-a', parentId: 'parent', listenerType: 'internal' },
    { beaconid: 'child-b', parentId: 'parent', listenerType: 'internal' },
  ]
}

describe('getCascadeDepth', () => {
  it('keeps sibling children at level 1 regardless of Y', () => {
    const agents = parentWithTwoChildren()
    expect(getCascadeDepth(agents[0], agents)).toBe(0)
    expect(getCascadeDepth(agents[1], agents)).toBe(1)
    expect(getCascadeDepth(agents[2], agents)).toBe(1)
  })

  it('counts a grandchild as level 2', () => {
    const agents = [
      { beaconid: 'root', listenerType: 'external' },
      { beaconid: 'mid', parentId: 'root', listenerType: 'internal' },
      { beaconid: 'leaf', parentId: 'mid', listenerType: 'internal' },
    ]
    expect(getCascadeDepth(agents[2], agents)).toBe(2)
  })
})

describe('buildBeaconLayerRows', () => {
  it('does not invent Cascade Level 2 when a sibling is dragged', () => {
    const agents = parentWithTwoChildren()
    const before = buildBeaconLayerRows(agents, {
      parent: { x: 400, y: 0 },
      'child-a': { x: 200, y: 190 },
      'child-b': { x: 600, y: 190 },
    })

    const after = buildBeaconLayerRows(agents, {
      parent: { x: 400, y: 0 },
      'child-a': { x: 80, y: 520 },
      'child-b': { x: 600, y: 190 },
    })

    const cascadeLabels = (rows: ReturnType<typeof buildBeaconLayerRows>) =>
      rows.filter((row) => row.kind === 'cascade').map((row) => row.label)

    expect(cascadeLabels(before)).toEqual(['Cascade Level 1'])
    expect(cascadeLabels(after)).toEqual(['Cascade Level 1'])
    expect(after.some((row) => row.label === 'Cascade Level 2')).toBe(false)
    expect(after.find((row) => row.label === 'Cascade Level 1')?.summary).toBe('2 nodes')
  })
})
