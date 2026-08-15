import { describe, it, expect } from 'vitest'
import { pick, toNumber, pickString } from '../../src/utils/object'

describe('object.pick', () => {
  it('returns fallback for non-object source', () => {
    expect(pick(null, ['a'], 'fb')).toBe('fb')
    expect(pick(undefined, ['a'], 'fb')).toBe('fb')
    expect(pick('string', ['a'], 'fb')).toBe('fb')
    expect(pick(42, ['a'], 'fb')).toBe('fb')
    expect(pick(true, ['a'], 'fb')).toBe('fb')
  })

  it('returns fallback when source has none of the keys', () => {
    expect(pick({ a: 1 }, ['x', 'y'], 'fb')).toBe('fb')
  })

  it('returns fallback when all matched keys are empty', () => {
    // undefined / null / '' are all skipped, fallback wins.
    expect(pick({ a: undefined, b: null, c: '' }, ['a', 'b', 'c'], 'fb')).toBe('fb')
  })

  it('returns the first non-empty value by priority order', () => {
    expect(pick({ a: '', b: 'second', c: 'third' }, ['a', 'b', 'c'])).toBe('second')
  })

  it('does not stop at falsy-but-present values like 0 or false', () => {
    // 0 and false are NOT empty — pick returns them as the first non-empty match.
    expect(pick({ a: 0, b: 1 }, ['a', 'b'])).toBe(0)
    expect(pick({ a: false, b: true }, ['a', 'b'])).toBe(false)
  })

  it('defaults fallback to empty string when not provided', () => {
    expect(pick({}, ['a'])).toBe('')
  })

  it('returns the raw value without coercion', () => {
    const obj = { nested: { x: 1 } }
    expect(pick(obj, ['nested'])).toBe(obj.nested)
  })
})

describe('object.toNumber', () => {
  it('returns the number for finite numeric inputs', () => {
    expect(toNumber(0)).toBe(0)
    expect(toNumber(42)).toBe(42)
    expect(toNumber(-3.5)).toBe(-3.5)
  })

  it('parses numeric strings', () => {
    expect(toNumber('1.5')).toBe(1.5)
    expect(toNumber('42')).toBe(42)
    expect(toNumber('0')).toBe(0)
  })

  it('returns 0 for NaN-producing inputs', () => {
    expect(toNumber('abc')).toBe(0)
    expect(toNumber(undefined)).toBe(0)
    expect(toNumber(null)).toBe(0)
    expect(toNumber({})).toBe(0)
    expect(toNumber([1, 2])).toBe(0)
  })

  it('returns 0 for Infinity / -Infinity', () => {
    expect(toNumber(Infinity)).toBe(0)
    expect(toNumber(-Infinity)).toBe(0)
    expect(toNumber('Infinity')).toBe(0)
  })

  it('coerces booleans to numbers (true→1, false→0)', () => {
    expect(toNumber(true)).toBe(1)
    expect(toNumber(false)).toBe(0)
  })
})

describe('object.pickString', () => {
  it('returns fallback for null / undefined', () => {
    expect(pickString(null, '-')).toBe('-')
    expect(pickString(undefined, '-')).toBe('-')
  })

  it('defaults fallback to empty string', () => {
    expect(pickString(null)).toBe('')
  })

  it('returns fallback for empty string input', () => {
    expect(pickString('', 'fallback')).toBe('fallback')
  })

  it('returns the stringified value for non-empty inputs', () => {
    expect(pickString('hello', 'fb')).toBe('hello')
    expect(pickString(42, 'fb')).toBe('42')
    expect(pickString(true, 'fb')).toBe('true')
  })

  it('returns "0" for numeric 0 (not treated as empty)', () => {
    // 0 is not null/undefined, so it gets stringified to "0" (not fallback).
    expect(pickString(0, 'fb')).toBe('0')
  })

  it('returns "false" for boolean false (not treated as empty)', () => {
    expect(pickString(false, 'fb')).toBe('false')
  })
})
