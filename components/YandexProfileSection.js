'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import AppButton from '@components/AppButton'
import ModalSection from '@components/ModalSection'
import Notice from '@components/Notice'
import YandexAuthButton from '@components/YandexAuthButton'
import { apiJson } from '@helpers/apiClient'

export default function YandexProfileSection({ userId, confirm }) {
  const status = useQuery({ queryKey: ['yandex-profile-link', userId], queryFn: () => apiJson('/api/yandex-id/link') })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { linked, enabled } = status.data?.data ?? {}
  if (!linked && !enabled && !status.isError && !error) return null
  const unlink = () => confirm({
    title: 'Отвязать Яндекс ID?',
    text: 'Вход через Яндекс будет недоступен до повторной привязки. Текущая сессия останется открытой. Убедитесь, что знаете пароль для входа по телефону.',
    onConfirm: async () => {
      setError(''); setBusy(true)
      try {
        const result = await apiJson('/api/yandex-id/link', { method: 'DELETE' })
        if (result.data?.linked !== false) throw new Error('Не удалось подтвердить отвязку')
        await status.refetch()
      } catch (cause) { setError(cause.message) }
      finally { setBusy(false) }
    },
  })
  return <ModalSection title="Яндекс ID">
    {error || status.isError ? <Notice tone="error">{error || 'Не удалось проверить подключение Яндекс ID'}</Notice> : null}
    {status.isError ? <AppButton variant="secondary" onClick={() => status.refetch()}>Повторить</AppButton> : null}
    {linked ? <>
      <p className="card-muted mb-2 text-sm">Подключён для входа в этот профиль.</p>
      <AppButton variant="danger" disabled={busy} onClick={unlink}>Отвязать Яндекс ID</AppButton>
    </> : enabled ? <YandexAuthButton href="/api/yandex-id/start?link=1">Подключить Яндекс ID</YandexAuthButton> : null}
  </ModalSection>
}
