import { useEffect, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { api } from '../../shared/api/client'
import { beginYandex, linkYandex } from '../../shared/auth/yandex'
import { Button, SectionTitle, Surface } from '../../shared/ui/components'
import { Notice } from '../../shared/ui/Notice'
import { YandexButton } from '../../shared/auth/YandexButton'

export function YandexLinkSection({ linked, disabled, onLinked }: {
  linked: boolean; disabled: boolean; onLinked: () => Promise<void>
}) {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(true), busy = useRef(false)
  useEffect(() => {
    active.current = true
    api.get<{ data: { allowYandexAuth?: boolean } }>('/global/auth/vk-status', { skipAuth: true, skipRefresh: true })
      .then(response => { if (active.current) setEnabled(response.data?.allowYandexAuth === true) }).catch(() => undefined)
    return () => { active.current = false }
  }, [])
  const connect = async () => {
    if (busy.current || disabled) return
    busy.current = true; setLoading(true); setError('')
    try {
      const proof = await beginYandex(true)
      if (!proof || !active.current) return
      await linkYandex(proof)
      if (active.current) await onLinked()
    } catch (reason) { if (active.current) setError(reason instanceof Error ? reason.message : 'Не удалось подключить Яндекс ID') }
    finally { busy.current = false; if (active.current) setLoading(false) }
  }
  const unlink = () => Alert.alert('Отвязать Яндекс ID?',
    'Вход через Яндекс будет недоступен до повторной привязки. Текущая сессия останется открытой. Убедитесь, что знаете пароль для входа по телефону.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Отвязать', style: 'destructive', onPress: async () => {
        if (busy.current || disabled || !active.current) return
        busy.current = true; setLoading(true); setError('')
        try {
          const result = await api.delete<{ success: boolean; data?: { linked: boolean } }>('/yandex-id/link')
          if (!result.success || result.data?.linked !== false) throw new Error('Не удалось подтвердить отвязку')
          if (active.current) await onLinked()
        } catch (reason) { if (active.current) setError(reason instanceof Error ? reason.message : 'Не удалось отвязать Яндекс ID') }
        finally { busy.current = false; if (active.current) setLoading(false) }
      } },
    ])
  if (!enabled && !linked) return null
  return <Surface>
    <SectionTitle>Яндекс ID</SectionTitle>
    <Notice tone={linked ? 'success' : 'info'} message={linked ? 'Яндекс ID подключён. Можно использовать его для входа.' : 'Подключите Яндекс ID с тем же номером телефона, что указан в вашем аккаунте.'} />
    {error ? <Notice tone="danger" message={error} /> : null}
    {linked ? <Button title="Отвязать Яндекс ID" variant="danger" onPress={unlink} loading={loading} disabled={disabled} /> : null}
    {enabled && !linked ? <YandexButton title="Подключить Яндекс ID" onPress={connect} loading={loading} disabled={disabled} /> : null}
  </Surface>
}
