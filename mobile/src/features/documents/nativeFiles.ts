import * as Sharing from 'expo-sharing'
import { File, Paths } from 'expo-file-system'
import { api } from '../../shared/api/client'
import { decryptToTemporaryFile, deleteTemporaryDecryptedFile, type EncryptedLocalFile } from '../../shared/storage/encryptedFiles'
import type { DocumentTemplate } from '../../shared/domain/types'
import { DOCX_MIME } from './documentUi'

export const shareEncryptedFile = async (file: EncryptedLocalFile, current: () => boolean = () => true) => {
  let uri = ''
  try {
    uri = await decryptToTemporaryFile(file)
    if (current()) await Sharing.shareAsync(uri, { mimeType: file.mimeType, dialogTitle: file.name })
  } finally {
    if (uri) await deleteTemporaryDecryptedFile(uri).catch(() => undefined)
  }
}
export const downloadAndShareTemplate = async (template: DocumentTemplate, current: () => boolean = () => true) => {
  let destination: File | null = null
  try {
    const content = await api.download(`/mobile/v1/document-templates/${encodeURIComponent(template.id)}`)
    if (!current()) return
    const safeName = template.fileName.replace(/[\r\n\\/:*?"<>|]/g, '_')
    destination = new File(Paths.cache, `vedelo-template-${template.id.replace(/[^\w-]/g, '_')}-${safeName}`)
    destination.create({ overwrite: true, intermediates: true })
    destination.write(new Uint8Array(content))
    await Sharing.shareAsync(destination.uri, { mimeType: DOCX_MIME, dialogTitle: template.name })
  } finally {
    try { if (destination?.exists) destination.delete() } catch { /* Очистка не подменяет исходную ошибку share/download. */ }
  }
}
