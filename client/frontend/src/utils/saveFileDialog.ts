import { Dialogs } from '@wailsio/runtime'

type SaveFileDialogOptions = Parameters<typeof Dialogs.SaveFile>[0]

function isDialogCancellation(error: unknown): boolean {
  const message = String((error as { message?: unknown } | undefined)?.message || error || '').toLowerCase()
  return message.includes('cancelled by user') || message.includes('canceled by user')
}

/**
 * Opens the native save dialog. A user cancellation is a normal outcome and
 * is represented by an empty path instead of an unhandled promise rejection.
 */
export async function openSaveFileDialog(options: SaveFileDialogOptions): Promise<string> {
  try {
    return await Dialogs.SaveFile(options)
  } catch (error) {
    if (isDialogCancellation(error)) return ''
    throw error
  }
}
