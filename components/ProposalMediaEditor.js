'use client'

import { useRef } from 'react'
import { faArrowUp } from '@fortawesome/free-solid-svg-icons/faArrowUp'
import { faArrowDown } from '@fortawesome/free-solid-svg-icons/faArrowDown'
import { faTrashAlt } from '@fortawesome/free-regular-svg-icons'
import AppButton from '@components/AppButton'
import IconActionButton from '@components/IconActionButton'
import { sendFile } from '@helpers/cloudinary'
import { resolveUploadedFileUrl } from '@helpers/escalionCloudUpload.mjs'
import { normalizeProposalMedia } from '@helpers/proposalContent'

export default function ProposalMediaEditor({
  media = [], onChange, directory, busy, setBusy, onError,
}) {
  const input = useRef(null)
  const uploading = useRef(false)
  const full = media.length >= 10
  const upload = async (file) => {
    if (!file || busy || uploading.current || full) return
    const isVideo = file.type === 'video/mp4'
    const valid = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'].includes(file.type)
    if (!valid || file.size > (isVideo ? 50 : 10) * 1024 * 1024) {
      onError('Разрешены JPG, PNG, WebP до 10 МБ и MP4 до 50 МБ')
      return
    }
    uploading.current = true
    setBusy(true)
    onError('')
    try {
      const result = await sendFile(file, null, directory)
      const url = resolveUploadedFileUrl(result, { directory })
      if (!url) throw new Error('upload_failed')
      onChange([...media, {
        id: crypto.randomUUID(), kind: isVideo ? 'video' : 'image', url,
        title: file.name, fileName: file.name, contentType: file.type, size: file.size,
      }])
    } catch {
      onError('Не удалось загрузить файл. Повторите попытку')
    } finally {
      uploading.current = false
      setBusy(false)
    }
  }
  const moveMedia = (index, direction) => {
    const target = index + direction
    if (busy || uploading.current || target < 0 || target >= media.length) return
    const reordered = [...media]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    onChange(reordered)
  }
  const addLink = () => {
    if (busy || uploading.current || full) return
    const url = window.prompt('Ссылка на VK Video, Rutube, YouTube или Vimeo')
    if (!url) return
    const items = normalizeProposalMedia([{
      id: crypto.randomUUID(), kind: 'video_link', url, title: 'Видео',
    }])
    if (!items.length) {
      onError('Укажите корректную http(s)-ссылку на VK Video, Rutube, YouTube или Vimeo')
      return
    }
    onError('')
    onChange([...media, ...items])
  }
  return (
    <details className="rounded-lg border border-gray-200 p-3">
      <summary className="cursor-pointer font-semibold">Фото и видео ({media.length}/10)</summary>
      <div className="mt-2 space-y-2">
        {media.map((item, index) => (
          <div key={item.id || item.url} className="flex items-center justify-between gap-2 rounded border p-2 text-xs">
            <span className="min-w-0 flex-1 truncate" title={item.url}>{item.title || item.url}</span>
            <div className="flex shrink-0 items-center gap-1">
              <IconActionButton icon={faArrowUp} variant="neutral" size="base"
                title={`Переместить вверх «${item.title || item.url}»`}
                disabled={busy || index === 0}
                onClick={() => moveMedia(index, -1)} />
              <IconActionButton icon={faArrowDown} variant="neutral" size="base"
                title={`Переместить вниз «${item.title || item.url}»`}
                disabled={busy || index === media.length - 1}
                onClick={() => moveMedia(index, 1)} />
              <IconActionButton icon={faTrashAlt} variant="danger" size="base"
                title={`Удалить «${item.title || item.url}»`} disabled={busy}
                onClick={() => onChange(media.filter((_, current) => current !== index))} />
            </div>
          </div>
        ))}
      </div>
      <div className="tablet:flex-row mt-3 flex flex-col gap-2">
        <AppButton variant="secondary" size="sm" disabled={busy || full}
          onClick={() => input.current?.click()}>Загрузить фото или видео</AppButton>
        <input ref={input} className="hidden" type="file" aria-label="Фото или видео"
          accept="image/jpeg,image/png,image/webp,video/mp4" disabled={busy || full}
          onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = '' }} />
        <AppButton variant="secondary" size="sm" disabled={busy || full}
          onClick={addLink}>Добавить видео-ссылку</AppButton>
      </div>
    </details>
  )
}
