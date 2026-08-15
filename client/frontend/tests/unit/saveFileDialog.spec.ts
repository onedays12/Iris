import { describe, expect, it, vi } from 'vitest'
import { Dialogs } from '@wailsio/runtime'
import { openSaveFileDialog } from '../../src/utils/saveFileDialog'

describe('openSaveFileDialog', () => {
  it('returns an empty path when the user cancels', async () => {
    vi.spyOn(Dialogs, 'SaveFile').mockRejectedValueOnce(
      new Error('Invalid dialog call: Dialog.SaveFile failed: error getting selection: cancelled by user'),
    )

    await expect(openSaveFileDialog({ Filename: 'test.bin' })).resolves.toBe('')
  })

  it('propagates non-cancellation errors', async () => {
    const error = new Error('dialog unavailable')
    vi.spyOn(Dialogs, 'SaveFile').mockRejectedValueOnce(error)

    await expect(openSaveFileDialog({ Filename: 'test.bin' })).rejects.toBe(error)
  })
})
