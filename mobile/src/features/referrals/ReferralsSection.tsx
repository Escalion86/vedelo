import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, Share, StyleSheet, Text } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useFocusEffect } from 'expo-router'
import { api } from '../../shared/api/client'
import { env } from '../../shared/config/env'
import { useAuth } from '../../shared/auth/AuthProvider'
import { Button, EmptyState, Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { money } from '../statistics/statistics'
import { useSectionData } from '../statistics/useSectionData'
import { readReferrals, referralLink, referralName } from './referrals'
const path = '/mobile/v1/referrals?scope=mine'
const read = async (signal: AbortSignal) => readReferrals(await api.get(path, { signal }))
const day = (value: string | null) => value ? new Date(value).toLocaleDateString('ru-RU') : '—'
export function ReferralsSection() {
  const { user } = useAuth(); const { palette } = useTheme(); const styles = useThemeStyles(createStyles)
  const session = useSectionData(path, read)
  const link = referralLink(env.apiBaseUrl, user?._id || '')
  const actionLock = useRef(false)
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState<{ key: string; message: string; tone: 'info' | 'danger' } | null>(null)
  useFocusEffect(useCallback(() => { setWorking(actionLock.current); setNotice(null) }, [session.key]))
  const act = async (kind: 'copy' | 'share') => {
    const epoch = session.token()
    if (!link || !session.data || actionLock.current || !session.current(epoch)) return
    actionLock.current = true; setWorking(true); setNotice(null)
    try {
      if (kind === 'copy') {
        const result = await Clipboard.setStringAsync(link)
        if (result === false) throw new Error('COPY_FAILED')
        if (session.current(epoch)) setNotice({ key: session.key, tone: 'info', message: 'Реферальная ссылка скопирована' })
      } else await Share.share({ message: link })
    } catch { if (session.current(epoch)) setNotice({ key: session.key, tone: 'danger', message: kind === 'copy' ? 'Не удалось скопировать ссылку. Её можно выделить вручную.' : 'Не удалось поделиться ссылкой. Повторите попытку.' }) }
    finally { actionLock.current = false; if (session.current(session.token())) setWorking(false) }
  }
  const busy = working && actionLock.current
  return <>
    {session.loading ? <ActivityIndicator accessibilityLabel="Загрузка рефералов" color={palette.primary} /> : null}
    {session.error ? <Notice tone="danger" message={session.error} /> : null}
    {session.data ? <>
      <Surface><SectionTitle>Ваша реферальная ссылка</SectionTitle><Text style={styles.meta}>Поделитесь ссылкой с новым пользователем.</Text>{link ? <Text selectable style={styles.link}>{link}</Text> : <Notice tone="danger" message="Не удалось сформировать ссылку для текущего профиля." />}<Button title="Скопировать ссылку" onPress={() => act('copy')} disabled={!link || busy} /><Button title="Поделиться ссылкой" variant="secondary" onPress={() => act('share')} disabled={!link || busy || typeof Share.share !== 'function'} /></Surface>
      <Surface variant="kpi"><Text style={styles.text}>Приглашено: {session.data.referralsCount}</Text><Text style={styles.text}>Начислено: {money(session.data.rewardsTotal)}</Text><Text style={styles.meta}>Начислений: {session.data.rewardsCount}</Text></Surface>
      {!session.data.referrals.length ? <EmptyState title="Рефералов пока нет" description="Пока никто не зарегистрировался по вашей ссылке." /> : session.data.referrals.map((row) => <Surface key={row.user._id}><Text style={styles.title}>{referralName(row.user)}</Text><Text style={styles.meta}>Регистрация: {day(row.user.createdAt)}</Text><Text style={styles.text}>{money(row.rewardsTotal)} · Начислений: {row.rewardsCount}</Text><Text style={styles.meta}>Последнее начисление: {day(row.lastRewardAt)}</Text></Surface>)}
    </> : null}
    {notice?.key === session.key ? <Notice tone={notice.tone} message={notice.message} /> : null}
    <Button title={session.error ? 'Повторить загрузку' : 'Обновить'} variant="secondary" onPress={session.load} loading={session.loading} disabled={busy} />
  </>
}
const createStyles = (p: Palette) => StyleSheet.create({ title: { color: p.cardTitle, fontSize: 16, fontWeight: '600' }, text: { color: p.text, fontSize: 14, lineHeight: 20 }, meta: { color: p.cardMuted, fontSize: 12, lineHeight: 18 }, link: { color: p.text, fontSize: 14, lineHeight: 22, flexShrink: 1 } })
