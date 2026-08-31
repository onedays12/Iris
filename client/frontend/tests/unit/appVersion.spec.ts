import { describe, expect, it } from 'vitest'
import { APP_VERSION } from '../../src/constants/appVersion'
import pkg from '../../package.json'

describe('APP_VERSION', () => {
  it('matches frontend/package.json and is semver', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(APP_VERSION).toBe(pkg.version)
  })
})
