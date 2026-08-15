import { pickFile } from '../../shared/protocol/adapter'
import { toNumber } from '../../utils/object'

export interface StoredFile {
  fileId: string
  fileName: string
  size: number
  sha256: string
  modTime: string
  downloadUrl: string
  raw: unknown
}

export function normalizeStoredFile(value: unknown): StoredFile {
  const file = pickFile(value)
  return {
    fileId: String(file.fileId),
    fileName: String(file.fileName),
    size: toNumber(file.size),
    sha256: String(file.sha256),
    modTime: String(file.modTime),
    downloadUrl: String(file.downloadUrl),
    raw: value,
  }
}
