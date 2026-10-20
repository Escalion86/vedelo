'use client'

import AiBadge from '@components/AiBadge'

import { useRef, useState } from 'react'
import PropTypes from 'prop-types'
import Modal from '@components/Modal'
import AppButton from '@components/AppButton'
import Notice from '@components/Notice'
import useWorkItemTerminology from '@helpers/useWorkItemTerminology'

const PhotoDraftModal = ({ open, onClose, onDraft }) => {
  const terms = useWorkItemTerminology()
  const picker = useRef(null)
  const camera = useRef(null)
  const revision = useRef(0)
  const inFlight = useRef(false)
  const [image, setImage] = useState('')
  const [reading, setReading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const busy = reading || processing

  const reset = () => { revision.current++; setImage(''); setResult(null); setError(''); setReading(false) }
  const close = () => { if (!inFlight.current) { reset(); onClose() } }
  const choose = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || inFlight.current) return
    reset()
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size === 0) {
      setError('Выберите изображение JPEG, PNG или WebP. Переснимите заметку или выберите другое фото.')
      return
    }
    if (file.size > 5 * 1024 * 1024) { setError('Фото слишком большое. Максимум 5 МБ.'); return }
    const current = revision.current
    setReading(true)
    const reader = new FileReader()
    reader.onload = () => {
      if (current !== revision.current) return
      setImage(String(reader.result)); setReading(false)
    }
    reader.onerror = () => { if (current === revision.current) { setError('Не удалось прочитать файл. Выберите другое фото.'); setReading(false) } }
    reader.readAsDataURL(file)
  }
  const recognize = async () => {
    if (!image || busy || inFlight.current) return
    inFlight.current = true
    setProcessing(true); setError('')
    try {
      if (navigator.onLine === false) throw new Error('Для распознавания нужен интернет. Попробуйте после подключения.')
      const response = await fetch('/api/events/ai-photo-draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ image }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || payload?.error || !payload?.fields || !payload?.sourceText) {
        throw new Error(payload?.error || 'Не удалось распознать фото. Переснимите заметку или выберите другое фото.')
      }
      setResult(payload)
    } catch (reason) { setError(reason?.message || 'Не удалось распознать фото. Попробуйте позже.') }
    finally { inFlight.current = false; setProcessing(false) }
  }
  const apply = () => {
    if (!result || inFlight.current) return
    onDraft(result.fields, result.sourceText, result.aiFilledFields ?? [], result.client ?? null, result.aiWarnings ?? [])
    reset()
  }

  return <Modal open={open} onClose={close} disableBackdropClick={busy} size="lg"
    title={<span className="mr-8">Фото заметки для {terms.genitive}</span>}
    footer={<div className="flex flex-wrap justify-end gap-2">
      <AppButton variant="secondary" onClick={close} disabled={processing}>Отмена</AppButton>
      <AppButton onClick={result ? apply : recognize} disabled={busy || !image} aria-busy={processing}>
        {processing ? 'Распознаём фото…' : result ? 'Открыть заполненную форму' : 'Распознать и заполнить'}
        {!result ? <AiBadge /> : null}
      </AppButton>
    </div>}>
    <div className="photo-draft-content flex flex-col gap-3">
      <Notice tone="info">Выберите фото бумажной заметки или скриншот о {terms.prepositional}. После распознавания проверьте текст и поля. {terms.labelCapitalized} сохранится только после вашего подтверждения в обычной форме.</Notice>
      <p className="text-sm">Фото отправится настроенному ИИ только после нажатия «Распознать и заполнить». Это две операции: распознавание фото и заполнение полей, с обычной тарификацией ИИ. Контакт из заметки может создать клиента, как при текстовом вводе.</p>
      <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} disabled={busy} className="hidden" aria-label="Выбрать изображение заметки" />
      <input ref={camera} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={choose} disabled={busy} className="hidden" aria-label="Снять заметку камерой" />
      <div className="flex flex-wrap gap-2">
        <AppButton variant="secondary" onClick={() => picker.current?.click()} disabled={busy}>{image ? 'Заменить изображение' : 'Выбрать изображение'}</AppButton>
        <AppButton variant="secondary" onClick={() => camera.current?.click()} disabled={busy}>Снять фотографию</AppButton>
        {image ? <AppButton variant="ghost" onClick={reset} disabled={busy}>Убрать фото</AppButton> : null}
      </div>
      <p className="text-sm">JPEG, PNG или WebP, до 5 МБ и 20 мегапикселей. На телефоне кнопка камеры предлагает сделать отдельный снимок.</p>
      {reading ? <Notice role="status">Читаем выбранное изображение…</Notice> : null}
      {image ? /* eslint-disable-next-line @next/next/no-img-element */
        <img src={image} alt="Предпросмотр выбранной заметки" className="max-h-64 w-full rounded-lg object-contain" onError={() => { setImage(''); setError('Файл повреждён. Выберите другое фото.') }} /> : null}
      {processing ? <Notice role="status">ИИ распознаёт заметку и заполняет поля…</Notice> : null}
      {error ? <Notice tone="error" role="alert">{error}</Notice> : null}
      {result ? <>
        <p className="font-semibold">Распознанный текст</p>
        <pre className="photo-draft-source whitespace-pre-wrap break-words rounded-lg border p-3 text-sm">{result.sourceText}</pre>
        <Notice tone="warning">Проверьте имена, телефоны, даты и суммы по оригиналу перед сохранением.</Notice>
        {result.aiWarnings?.map((warning, index) => <Notice tone="warning" key={index}>{warning}</Notice>)}
      </> : null}
    </div>
  </Modal>
}
PhotoDraftModal.propTypes = { open: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired, onDraft: PropTypes.func.isRequired }
export default PhotoDraftModal
