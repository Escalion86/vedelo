/* eslint-disable react-hooks/exhaustive-deps */
import FormWrapper from '@components/FormWrapper'
import Input from '@components/Input'
import Notice from '@components/Notice'
import AppButton from '@components/AppButton'
import { getData, postData } from '@helpers/CRUD'
import useSnackbar from '@helpers/useSnackbar'
import { useEffect, useRef, useState } from 'react'

const changePasswordFunc = () => {
  const ChangePasswordModal = ({ closeModal, setOnConfirmFunc, setDisableConfirm, setConfirmButtonName, setTitle }) => {
    const snackbar = useSnackbar()
    const [hasPassword, setHasPassword] = useState(null)
    const [statusLoading, setStatusLoading] = useState(true)
    const [statusError, setStatusError] = useState('')
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [repeatPassword, setRepeatPassword] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const alive = useRef(false)
    const saving = useRef(false)
    const loadStatus = async () => {
      setStatusLoading(true)
      setStatusError('')
      const result = await getData('/api/auth/change-password', null, null, null, true)
      if (!alive.current) return
      if (result?.success && typeof result.hasPassword === 'boolean') setHasPassword(result.hasPassword)
      else { setHasPassword(null); setStatusError('Не удалось проверить состояние пароля') }
      setStatusLoading(false)
    }
    useEffect(() => {
      alive.current = true
      void loadStatus()
      return () => { alive.current = false }
    }, [])
    const name = hasPassword === null ? 'Сохранить' : hasPassword ? 'Сменить пароль' : 'Установить пароль'
    useEffect(() => {
      setConfirmButtonName(name)
      setTitle?.(hasPassword === false ? 'Установка пароля' : 'Смена пароля')
    }, [name, hasPassword, setConfirmButtonName, setTitle])
    const newError = newPassword && newPassword.length < 8 ? 'Минимум 8 символов' : newPassword.length > 200 ? 'Новый пароль слишком длинный' : null
    const repeatError = repeatPassword && newPassword !== repeatPassword ? 'Пароли не совпадают' : null
    const isValid = hasPassword !== null && !statusLoading && (!hasPassword || !!currentPassword) && newPassword.length >= 8 && newPassword.length <= 200 && newPassword === repeatPassword
    useEffect(() => { setDisableConfirm(!isValid || isSaving) }, [isValid, isSaving, setDisableConfirm])
    const handleSave = async () => {
      if (!isValid || saving.current) return
      saving.current = true
      setIsSaving(true)
      try {
        await postData('/api/auth/change-password', { currentPassword: hasPassword ? currentPassword : '', newPassword },
          (result) => {
            if (!alive.current) return
            if (!result?.success) { snackbar.error(result?.error || 'Не удалось обновить пароль'); return }
            setHasPassword(true)
            snackbar.success(hasPassword ? 'Пароль изменён' : 'Пароль установлен')
            closeModal()
          },
          (error) => {
            if (!alive.current) return
            snackbar.error(error?.status && error.status < 500 ? error.message : 'Результат не подтверждён. Проверьте состояние пароля перед повтором')
            void loadStatus()
          }, true)
      } finally {
        saving.current = false
        if (alive.current) { setIsSaving(false); setCurrentPassword(''); setNewPassword(''); setRepeatPassword('') }
      }
    }
    const onConfirmRef = useRef(handleSave)
    useEffect(() => { onConfirmRef.current = handleSave }, [handleSave])
    useEffect(() => { setOnConfirmFunc(() => onConfirmRef.current?.()) }, [setOnConfirmFunc])
    return <FormWrapper flex className="flex-col gap-3">
      {statusLoading ? <Notice role="status">Проверяем состояние пароля…</Notice> : statusError ? <>
        <Notice tone="error" role="alert">{statusError}</Notice>
        <AppButton variant="secondary" onClick={loadStatus}>Повторить</AppButton>
      </> : <>
        {!hasPassword && <Notice>Установите пароль Ведело для входа по номеру телефона. Пароль от VK вводить не нужно.</Notice>}
        {hasPassword && <Input label="Текущий пароль" type="password" value={currentPassword} onChange={setCurrentPassword} disabled={isSaving} />}
        <Input label="Новый пароль" type="password" value={newPassword} onChange={setNewPassword} error={newError} showErrorText disabled={isSaving} />
        <Input label="Повторите пароль" type="password" value={repeatPassword} onChange={setRepeatPassword} error={repeatError} showErrorText disabled={isSaving} />
      </>}
    </FormWrapper>
  }
  return { title: 'Пароль', confirmButtonName: 'Сохранить', declineButtonName: 'Отмена', Children: ChangePasswordModal }
}
export default changePasswordFunc
