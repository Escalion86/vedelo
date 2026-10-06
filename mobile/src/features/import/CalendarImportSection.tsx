import { useCallback, useRef, useState } from 'react'
import { Linking, Text } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useAuth } from '../../shared/auth/AuthProvider'
import { Button, Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { useTheme } from '../../shared/ui/ThemeProvider'
import { calendarImportEntry } from './calendarImportApi'

export function CalendarImportSection() {
  const { user } = useAuth(), { palette } = useTheme()
  const life = useRef({ active: false, epoch: 0 }), lock = useRef(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  useFocusEffect(useCallback(() => {
    life.current.active = true; ++life.current.epoch; setBusy(lock.current); setError('')
    return () => { life.current.active = false; ++life.current.epoch }
  }, [user]))
  const open = async () => {
    if (!life.current.active || lock.current || !user?._id) return
    const epoch = life.current.epoch
    lock.current = true; setBusy(true); setError('')
    try { await Linking.openURL(calendarImportEntry.webUrl) }
    catch { if (life.current.active && epoch === life.current.epoch) setError('Не удалось открыть web-кабинет. Повторите попытку.') }
    finally {
      lock.current = false
      if (life.current.active) setBusy(false)
    }
  }
  return <Surface>
    <SectionTitle>Импорт из Google Calendar</SectionTitle>
    <Notice tone="info" message="Отдельный Google-импорт пока доступен только в web-кабинете. Обычная синхронизация Google в «Интеграциях» не подключает аккаунт для импорта." />
    <Text style={{ color: palette.cardMuted }}>В браузере войдите в нужный аккаунт Ведело, выберите Google Calendar, подключите отдельный аккаунт и календарь-источник. Нужен тариф с Google Calendar и ИИ. Список, стоимость и запуск подтверждаются в web-кабинете.</Text>
    {error ? <Notice tone="danger" message={error} /> : null}
    <Button title="Открыть Google-импорт в web" variant="secondary" onPress={open} loading={busy} disabled={!user?._id} />
  </Surface>
}
