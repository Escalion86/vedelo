import { useCallback, useEffect, useState } from 'react'
import Input from '@components/Input'
import Notice from '@components/Notice'

const NameEditor = ({ initialName, maxLength, onSave, closeModal, setOnConfirmFunc, setDisableConfirm, setOnShowOnCloseConfirmDialog }) => {
  const [name, setName] = useState(initialName)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = useCallback(async () => {
    setBusy(true)
    setError('')
    try { await onSave(name.trim()); closeModal() }
    catch (cause) { setError(cause.message || 'Не удалось сохранить название') }
    finally { setBusy(false) }
  }, [name, onSave, closeModal])
  useEffect(() => {
    setOnConfirmFunc(save)
    setDisableConfirm(busy || !name.trim() || name.trim() === initialName)
    setOnShowOnCloseConfirmDialog(name !== initialName)
  }, [save, busy, name, initialName, setOnConfirmFunc, setDisableConfirm, setOnShowOnCloseConfirmDialog])
  return <div className="flex flex-col gap-3 p-3">
    <Input label="Название" ariaLabel="Название" value={name} onChange={setName} maxLength={maxLength} disabled={busy} fullWidth />
    {error ? <Notice tone="error" role="alert">{error}</Notice> : null}
  </div>
}

export default function listItemNameFunc({ title = 'Название типа', initialName = '', maxLength = 60, onSave }) {
  return { title, confirmButtonName: 'Сохранить', Children: NameEditor, childrenProps: { initialName, maxLength, onSave } }
}
