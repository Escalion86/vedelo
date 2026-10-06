import { useFocusEffect } from 'expo-router'
import { CompactField } from '../../shared/ui/CompactField'
import { useScreenLifetime } from './useScreenLifetime'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import { Notice } from '../../shared/ui/Notice'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { api } from '../../shared/api/client'
import {
  Button,
  ErrorNotice,
  SectionTitle,
  Surface,
} from '../../shared/ui/components'
import { radius, spacing, type Palette } from '../../shared/ui/theme'

type ArtistStatus = 'individual_entrepreneur' | 'self_employed'
type ArtistRequisites = {
  artistStatus: ArtistStatus
  artistFullName: string
  artistName: string
  artistOgrnip: string
  artistInn: string
  artistBankName: string
  artistBik: string
  artistCheckingAccount: string
  artistCorrespondentAccount: string
  artistLegalAddress: string
}

const emptyRequisites: ArtistRequisites = {
  artistStatus: 'individual_entrepreneur',
  artistFullName: '',
  artistName: '',
  artistOgrnip: '',
  artistInn: '',
  artistBankName: '',
  artistBik: '',
  artistCheckingAccount: '',
  artistCorrespondentAccount: '',
  artistLegalAddress: '',
}

export function ArtistRequisitesSection() {
  const styles = useThemeStyles(createStyles)
  const [value, setValue] = useState<ArtistRequisites>(emptyRequisites)
  const capture = useScreenLifetime()
  const locked = useRef(false)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const current = capture()
    setLoading(true); setError('')
    try {
      const response = await api.get<{ success: true; data: ArtistRequisites }>('/mobile/v1/profile/requisites')
      if (current()) { setValue(response.data); setReady(true) }
    } catch { if (current()) setError('Не удалось загрузить реквизиты') }
    finally { if (current()) setLoading(false) }
  }, [capture])
  useFocusEffect(useCallback(() => { if (!ready && !locked.current) void load(); else setLoading(locked.current) }, [load, ready]))

  const update = (field: keyof ArtistRequisites, next: string) => {
    setValue((current) => ({ ...current, [field]: next }))
    setMessage('')
  }

  const save = async () => {
    if (!ready || locked.current) return
    locked.current = true
    const current = capture()
    setLoading(true); setError(''); setMessage('')
    try {
      const response = await api.patch<{ success: true; data: ArtistRequisites }>('/mobile/v1/profile/requisites', value, { skipRefresh: true })
      if (!current()) return
      const read = await api.get<{ success: true; data: ArtistRequisites }>('/mobile/v1/profile/requisites')
      if (!current()) return
      if (!response.success || !response.data || !read.success || !read.data || Object.keys(emptyRequisites).some((key) => read.data[key as keyof ArtistRequisites] !== response.data[key as keyof ArtistRequisites])) throw new Error('Unconfirmed')
      // The server clears OGRNIP for self-employed. Preserve the hidden draft on this screen.
      setValue({ ...read.data, artistOgrnip: value.artistStatus === 'self_employed' ? value.artistOgrnip : read.data.artistOgrnip })
      setMessage('Реквизиты сохранены и будут использоваться в новых документах')
    } catch { if (current()) setError('Сохранение не подтверждено. Поля сохранены на экране; проверьте реквизиты перед повтором.') }
    finally { locked.current = false; if (capture()()) setLoading(false) }
  }

  return <Surface>
    <SectionTitle>Реквизиты артиста</SectionTitle>
    <Text style={styles.hint}>Используются при генерации договоров и актов.</Text>
    {loading && !ready ? <Notice message="Загружаем реквизиты…" /> : null}
    {error && !ready ? <Button title="Повторить загрузку реквизитов" variant="secondary" onPress={load} loading={loading} /> : null}
    {ready ? <>
    <View style={styles.switchRow}>
      <StatusButton
        disabled={loading}
        title="ИП"
        selected={value.artistStatus === 'individual_entrepreneur'}
        onPress={() => update('artistStatus', 'individual_entrepreneur')}
      />
      <StatusButton
        disabled={loading}
        title="Самозанятый"
        selected={value.artistStatus === 'self_employed'}
        onPress={() => update('artistStatus', 'self_employed')}
      />
    </View>
    <CompactField editable={!loading} testID="artist-full-name" label="ФИО для документов" value={value.artistFullName} onChangeText={(text) => update('artistFullName', text)} />
    <CompactField editable={!loading} label="Наименование артиста" value={value.artistName} onChangeText={(text) => update('artistName', text)} />
    {value.artistStatus === 'individual_entrepreneur' ? <CompactField editable={!loading} label="ОГРНИП" value={value.artistOgrnip} onChangeText={(text) => update('artistOgrnip', text)} keyboardType="number-pad" /> : null}
    <CompactField editable={!loading} label="ИНН" value={value.artistInn} onChangeText={(text) => update('artistInn', text)} keyboardType="number-pad" />
    <CompactField editable={!loading} label="Банк" value={value.artistBankName} onChangeText={(text) => update('artistBankName', text)} />
    <CompactField editable={!loading} label="БИК" value={value.artistBik} onChangeText={(text) => update('artistBik', text)} keyboardType="number-pad" />
    <CompactField editable={!loading} label="Расчётный счёт" value={value.artistCheckingAccount} onChangeText={(text) => update('artistCheckingAccount', text)} keyboardType="number-pad" />
    <CompactField editable={!loading} label="Корреспондентский счёт" value={value.artistCorrespondentAccount} onChangeText={(text) => update('artistCorrespondentAccount', text)} keyboardType="number-pad" />
    <CompactField editable={!loading} label="Юридический адрес" value={value.artistLegalAddress} onChangeText={(text) => update('artistLegalAddress', text)} multiline />
    </> : null}
    {value.artistStatus === 'self_employed' && value.artistOgrnip ? <Notice tone="warning" message="При сохранении статуса самозанятого сервер очищает ОГРНИП. На этом экране введённый ОГРНИП сохранится до выхода." /> : null}
    {error ? <ErrorNotice message={error} /> : null}
    {message ? <Notice tone="success" message={message} /> : null}
    <Button testID="save-artist-requisites" title="Сохранить реквизиты" onPress={save} loading={loading} disabled={!ready} />
  </Surface>
}

const StatusButton = ({
  title,
  selected,
  onPress,
  disabled,
}: {
  title: string
  selected: boolean
  onPress: () => void
  disabled: boolean
}) => {
 const styles = useThemeStyles(createStyles)
 return <Pressable disabled={disabled}
  accessibilityRole="button"
  accessibilityState={{ selected, disabled }}
  style={[styles.statusButton, selected && styles.statusButtonSelected]}
  onPress={onPress}
>
  <Text style={[styles.statusText, selected && styles.statusTextSelected]}>{title}</Text>
</Pressable>
}

const createStyles = (palette: Palette) => StyleSheet.create({
  hint: { color: palette.cardMuted, fontSize: 12, lineHeight: 18 },
  switchRow: { flexDirection: 'row', gap: spacing.sm },
  statusButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.rowPressed },
  statusButtonSelected: { borderColor: palette.primary, backgroundColor: palette.rowSelected },
  statusText: { color: palette.cardMuted, fontSize: 13, fontWeight: '700' },
  statusTextSelected: { color: palette.selectionText },
  success: { color: palette.notice.success.text, fontSize: 13, lineHeight: 18 },
})
