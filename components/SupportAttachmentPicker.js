'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef } from 'react'

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_SIZE = 10 * 1024 * 1024

const SupportAttachmentPicker = ({ files, onChange, disabled, onError }) => {
  const inputRef = useRef(null)
  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files])

  useEffect(() => () => previews.forEach(({ url }) => URL.revokeObjectURL(url)), [previews])

  const addFiles = (selected) => {
    const next = Array.from(selected || [])
    if (files.length + next.length > 5) return onError('Можно прикрепить не более 5 изображений')
    if (next.some((file) => !ACCEPTED_TYPES.has(file.type))) return onError('Допустимы только JPEG, PNG и WebP')
    if (next.some((file) => file.size > MAX_SIZE)) return onError('Размер каждого изображения — не более 10 МБ')
    onError('')
    onChange([...files, ...next])
  }

  return (
    <div className="space-y-2">
      {previews.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {previews.map(({ file, url }, index) => (
            <div key={`${file.name}-${file.lastModified}-${index}`} className="relative h-20 w-20 overflow-hidden rounded-lg border border-gray-300 bg-white">
              <Image src={url} alt={file.name} fill unoptimized className="object-cover" />
              <button type="button" disabled={disabled} onClick={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))} className="absolute right-1 top-1 h-7 w-7 cursor-pointer rounded-full bg-black/70 text-white" aria-label={`Удалить ${file.name}`}>×</button>
            </div>
          ))}
        </div>
      ) : null}
      {files.length < 5 ? (
        <>
          <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="filter-control cursor-pointer disabled:opacity-50">Прикрепить изображения</button>
          <input ref={inputRef} className="hidden" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => { addFiles(event.target.files); event.target.value = '' }} />
        </>
      ) : null}
    </div>
  )
}

export default SupportAttachmentPicker
