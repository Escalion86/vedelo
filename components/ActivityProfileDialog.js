'use client'

import { useEffect, useId, useRef, useState } from 'react'
import ActivityProfileFields from '@components/ActivityProfileFields'
import AppButton from '@components/AppButton'
import Notice from '@components/Notice'
import { validateActivityProfile } from '@helpers/activityProfile.mjs'
import useSaveActivityProfile from '@helpers/useSaveActivityProfile'

export default function ActivityProfileDialog({ profile, required, onDismiss }) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef(null)
  const inFlight = useRef(false)
  const [draft, setDraft] = useState(profile)
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const saveActivityProfile = useSaveActivityProfile()

  useEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()
    return () => dialog.close()
  }, [])

  const save = async (event) => {
    event.preventDefault()
    if (inFlight.current) return
    setAttempted(true)
    setError('')
    const validation = validateActivityProfile(draft)
    if (!validation.value) return

    inFlight.current = true
    setBusy(true)
    try {
      await saveActivityProfile(validation.value)
      onDismiss?.()
    } catch (reason) {
      setError(reason.payload?.error?.message || 'Не удалось сохранить сферу деятельности. Проверьте соединение и повторите.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="tablet:rounded-lg m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-1rem)] max-w-lg overflow-y-auto rounded border border-gray-200 bg-white p-4 text-black shadow-lg backdrop:bg-black/60"
      onCancel={(event) => {
        event.preventDefault()
        if (!required && !busy) onDismiss?.()
      }}
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        <h2 id={titleId} className="text-lg font-semibold">Чем вы занимаетесь?</h2>
        <p id={descriptionId} className="text-sm">
          По сфере деятельности «Ведело» предложит подходящие шаблоны договоров и название для вашей работы в кабинете. Ответ также используется в статистике по видам деятельности. Сферу можно изменить в настройках.
        </p>
        <fieldset disabled={busy}>
          <ActivityProfileFields value={draft} onChange={setDraft} attempted={attempted} />
        </fieldset>
        {error && <Notice tone="error" role="alert">{error}</Notice>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-3">
          {!required && (
            <AppButton variant="secondary" onClick={onDismiss} disabled={busy}>Отмена</AppButton>
          )}
          <AppButton type="submit" disabled={busy}>
            {busy ? 'Сохраняем…' : required ? 'Сохранить и продолжить' : 'Сохранить'}
          </AppButton>
        </div>
      </form>
    </dialog>
  )
}
