import { ApiError } from '../../src/shared/api/errors'
import { CompactField } from '../../src/shared/ui/CompactField'
import { uploadOnce } from '../../src/features/profile/uploadOnce'
import { useScreenLifetime } from '../../src/features/profile/useScreenLifetime'
import { copyImage } from '../../src/features/profile/nativeImage'
import { useThemeStyles } from '../../src/shared/ui/ThemeProvider'
import { Notice } from '../../src/shared/ui/Notice'
import { useEffect, useRef, useState } from 'react'
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import { api } from '../../src/shared/api/client'
import { useAuth } from '../../src/shared/auth/AuthProvider'
import { getAuthSession, getRefreshToken } from '../../src/shared/auth/tokenStore'
import type { AuthSession, MobileUser } from '../../src/shared/auth/types'
import {
  Button,
  ErrorNotice,
  PageHeader,
  Screen,
  SectionTitle,
  Surface,
} from '../../src/shared/ui/components'
import type { Palette } from '../../src/shared/ui/theme'
import { ArtistRequisitesSection } from '../../src/features/profile/ArtistRequisitesSection'

type DeviceSession = {
  _id: string
  deviceName?: string
  platform?: string
  appVersion?: string
  lastUsedAt?: string
  createdAt?: string
  expiresAt?: string
  current?: boolean
}

const formatSessionDate = (value?: string) =>
  value
    && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'нет данных'

const avatarMimeTypes = ['image/jpeg', 'image/png', 'image/webp']

const getAvatarMimeType = (name: string, mimeType?: string | null) => {
  if (mimeType && avatarMimeTypes.includes(mimeType.toLowerCase())) {
    return mimeType.toLowerCase()
  }
  const extension = name.split('.').pop()?.toLowerCase()
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'png') return 'image/png'
  if (extension === 'webp') return 'image/webp'
  return ''
}

export default function ProfileScreen() {
  const { user } = useAuth()
  return user ? <UserProfileScreen key={`${user.tenantId}:${user._id}`} /> : <Screen><PageHeader title="Профиль" /><Notice message="Войдите в пользовательский аккаунт" /></Screen>
}

function UserProfileScreen() {
  const styles = useThemeStyles(createStyles)
  const { user: authUser, signOut, completeSignIn } = useAuth()
  const [user, setUser] = useState(authUser)
  const capture = useScreenLifetime()
  const locked = useRef(false)
  const sessionRevision = useRef(0)
  const [firstName, setFirstName] = useState(user?.firstName || '')
  const [secondName, setSecondName] = useState(user?.secondName || '')
  const [thirdName, setThirdName] = useState(user?.thirdName || '')
  const [email, setEmail] = useState(user?.email || '')
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp || '')
  const [viber, setViber] = useState(user?.viber || '')
  const [telegram, setTelegram] = useState(user?.telegram || '')
  const [vk, setVk] = useState(user?.vk || '')
  const [instagram, setInstagram] = useState(user?.instagram || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [hasPassword, setHasPassword] = useState<boolean | null>(null)
  const [passwordStatusLoading, setPasswordStatusLoading] = useState(true)
  const [passwordStatusError, setPasswordStatusError] = useState('')
  const passwordRevision = useRef(0)
  const newPasswordError = newPassword && newPassword.length < 8 ? 'Минимум 8 символов' : newPassword.length > 200 ? 'Новый пароль слишком длинный' : ''
  const repeatPasswordError = repeatPassword && newPassword !== repeatPassword ? 'Пароли не совпадают' : ''
  const passwordValid = hasPassword !== null && !passwordStatusLoading && (!hasPassword || !!currentPassword) && newPassword.length >= 8 && newPassword.length <= 200 && newPassword === repeatPassword

  const [sessions, setSessions] = useState<DeviceSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [sessionsError, setSessionsError] = useState('')
  const [revokingSessionId, setRevokingSessionId] = useState('')
  const [loading, setLoading] = useState(false)
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const run = async (task: (current: () => boolean) => Promise<void>, kind = 'profile') => {
    if (locked.current) return
    locked.current = true
    const current = capture()
    if (!current()) { locked.current = false; return }
    setLoading(true); setError(''); setMessage('')
    if (kind === 'avatar') setAvatarLoading(true)
    try { await task(current) }
    catch (reason) { if (current()) setError(reason instanceof ApiError && reason.status < 500 ? reason.message : 'Результат не подтверждён. Проверьте данные перед повторным действием.') }
    finally {
      locked.current = false
      if (capture()()) { setLoading(false); setAvatarLoading(false); setRevokingSessionId('') }
    }
  }
  const readProfile = async (current: () => boolean, expected?: MobileUser) => {
    const response = await api.get<{ success: boolean; data: MobileUser }>('/mobile/v1/auth/me')
    if (!current()) return false
    const read = response.data
    if (!response.success || read?._id !== user?._id || read?.tenantId !== user?.tenantId) throw new Error('Unconfirmed')
    if (expected) {
      for (const field of ['firstName', 'secondName', 'thirdName', 'email', 'whatsapp', 'viber', 'telegram', 'vk', 'instagram', 'images'] as const) {
        if (JSON.stringify(read[field] ?? '') !== JSON.stringify(expected[field] ?? '')) throw new Error('Unconfirmed')
      }
    }
    const session = await getAuthSession()
    if (!current() || session?.user._id !== user?._id || session?.user.tenantId !== user?.tenantId) return false
    await completeSignIn({ ...session, user: read })
    if (!current()) return false
    setUser(read)
    return true
  }
  const loadSessions = async () => {
    const scope = capture(), revision = ++sessionRevision.current
    const current = () => scope() && revision === sessionRevision.current
    setSessionsLoading(true); setSessionsError('')
    try {
      const response = await api.get<{ success: true; data: DeviceSession[] }>('/mobile/v1/auth/sessions')
      if (!response.success || !Array.isArray(response.data)) throw new Error('Unconfirmed')
      if (current()) setSessions(response.data)
      return response.data
    } catch {
      if (current()) setSessionsError('Не удалось загрузить устройства')
      throw new Error('Unconfirmed')
    } finally { if (current()) setSessionsLoading(false) }
  }
  const loadPasswordStatus = async () => {
    const scope = capture(), revision = ++passwordRevision.current
    const current = () => scope() && revision === passwordRevision.current
    setPasswordStatusLoading(true); setPasswordStatusError('')
    try {
      const response = await api.get<{ success: boolean; data: { hasPassword: boolean } }>('/mobile/v1/auth/change-password')
      if (!response.success || typeof response.data?.hasPassword !== 'boolean') throw new Error('Unconfirmed')
      if (current()) setHasPassword(response.data.hasPassword)
      return response.data.hasPassword
    } catch {
      if (current()) { setHasPassword(null); setPasswordStatusError('Не удалось проверить состояние пароля') }
      return null
    } finally { if (current()) setPasswordStatusLoading(false) }
  }
  useEffect(() => {
    void loadSessions().catch(() => undefined)
    void loadPasswordStatus()
  }, [])

  const save = () => run(async (current) => {
    const response = await api.patch<{ success: true; data: MobileUser }>('/mobile/v1/auth/me', {
      firstName, secondName, thirdName, email, whatsapp, viber, telegram, vk, instagram,
    }, { skipRefresh: true })
    if (!response.success || response.data?._id !== user?._id) throw new Error('Unconfirmed')
    if (current() && await readProfile(current, response.data)) setMessage('Профиль сохранён')
  })
  const pickAvatar = () => run(async (current) => {
    let copy: ReturnType<typeof copyImage> | undefined
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: avatarMimeTypes, copyToCacheDirectory: false, multiple: false })
      if (result.canceled || !current()) return
      const asset = result.assets[0]
      const mimeType = getAvatarMimeType(asset.name, asset.mimeType)
      if (!mimeType || !asset.size || asset.size > 5 * 1024 * 1024) {
        setError('Выберите непустое изображение JPEG, PNG или WebP до 5 МБ'); return
      }
      copy = copyImage(asset.uri, asset.name)
      const form = new FormData()
      form.append('files', { uri: copy.uri, name: asset.name, type: mimeType } as unknown as Blob)
      const response = await uploadOnce<{ success: true; data: MobileUser }>('/mobile/v1/profile/avatar', form)
      if (!response.success || response.data?._id !== user?._id) throw new Error('Unconfirmed')
      if (current() && await readProfile(current, response.data)) setMessage('Аватар обновлён')
    } finally { copy?.dispose() }
  }, 'avatar')
  const removeAvatar = () => Alert.alert('Удалить аватар?', 'В профиле снова будут показаны инициалы.', [
    { text: 'Отмена', style: 'cancel' },
    { text: 'Удалить', style: 'destructive', onPress: () => void run(async (current) => {
      const response = await api.delete<{ success: true; data: MobileUser }>('/mobile/v1/profile/avatar', undefined, { skipRefresh: true })
      if (!response.success || response.data?._id !== user?._id) throw new Error('Unconfirmed')
      if (current() && await readProfile(current, response.data)) setMessage('Аватар удалён')
    }, 'avatar') },
  ])
  const changePassword = () => {
    if (!passwordValid) return
    const wasSet = hasPassword
    return run(async (current) => {
      try {
        const response = await api.post<{ success: true; data: AuthSession }>('/mobile/v1/auth/change-password', { currentPassword: hasPassword ? currentPassword : '', newPassword }, { skipRefresh: true })
        if (!current()) return
        if (!response.success || response.data?.user._id !== user?._id || response.data.user.tenantId !== user?.tenantId) throw new Error('Unconfirmed')
        await completeSignIn(response.data)
        if (!current()) return
        setHasPassword(true)
        if (await loadPasswordStatus() !== true) throw new Error('Unconfirmed')
        await loadSessions()
        if (current()) setMessage(wasSet ? 'Пароль изменён' : 'Пароль установлен')
      } catch (reason) {
        if (current()) await loadPasswordStatus()
        throw reason
      } finally { if (current()) { setCurrentPassword(''); setNewPassword(''); setRepeatPassword('') } }
    })
  }
  const revoke = (sessionId: string) => run(async (current) => {
    setRevokingSessionId(sessionId)
    await api.delete('/mobile/v1/auth/sessions', { sessionId }, { skipRefresh: true })
    if (!current()) return
    const remaining = await loadSessions()
    if (remaining.some((item) => item._id === sessionId)) throw new Error('Unconfirmed')
    if (current()) setMessage('Устройство отключено')
  })
  const confirmRevoke = (session: DeviceSession) => Alert.alert('Отключить устройство?', `${session.deviceName || 'Устройство'} потеряет доступ к CRM, push и фоновой синхронизации.`, [
    { text: 'Отмена', style: 'cancel' }, { text: 'Отключить', style: 'destructive', onPress: () => void revoke(session._id) },
  ])
  const logout = () => run(async (current) => { await signOut(); if (current()) router.replace('/(auth)/login') })
  const requestDeletion = () => Alert.alert('Удаление аккаунта', 'Будет создан запрос на удаление аккаунта и данных. Все мобильные сессии завершатся.', [
    { text: 'Отмена', style: 'cancel' }, { text: 'Удалить аккаунт', style: 'destructive', onPress: () => void run(async (current) => {
      const refreshToken = await getRefreshToken()
      if (!current()) return
      const response = await api.post<{ success: boolean }>('/mobile/v1/auth/delete-account', { confirmation: 'УДАЛИТЬ', refreshToken }, { skipRefresh: true })
      if (!response.success) throw new Error('Unconfirmed')
      if (current()) { await signOut(); router.replace('/(auth)/login') }
    }) },
  ])

  return (
    <Screen contentStyle={styles.screenContent}>
      <PageHeader title="Профиль" subtitle={user?.phone || ''} />
      <Surface>
        <SectionTitle>Аватар</SectionTitle>
        <View style={styles.avatarRow}>
          <View style={styles.avatar}>
            {user?.images?.[0] ? (
              <Image
                accessibilityLabel="Аватар профиля"
                source={{ uri: user.images[0] }}
                style={styles.avatarImage}
              />
            ) : (
              <Text style={styles.avatarText}>
                {(user?.firstName || user?.phone || '?')
                  .slice(0, 1)
                  .toUpperCase()}
              </Text>
            )}
          </View>
          <View style={styles.avatarActions}>
            <Button
              title="Выбрать фото"
              variant="secondary"
              onPress={pickAvatar}
              loading={avatarLoading} disabled={loading}
            />
            {user?.images?.[0] ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Удалить аватар"
                style={{ minHeight: 40, justifyContent: 'center' }}
                disabled={loading}
                onPress={removeAvatar}
              >
                <Text style={styles.removeAvatar}>Удалить аватар</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        <Text style={styles.muted}>JPEG, PNG или WebP, не более 5 МБ.</Text>
      </Surface>
      <Surface>
        <SectionTitle>Личные данные</SectionTitle>
        <CompactField editable={!loading} label="Имя" value={firstName} onChangeText={setFirstName} />
        <CompactField editable={!loading}
          label="Фамилия"
          value={secondName}
          onChangeText={setSecondName}
        />
        <CompactField editable={!loading} label="Отчество" value={thirdName} onChangeText={setThirdName} />
        <CompactField editable={!loading}
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <CompactField editable={!loading}
          label="WhatsApp"
          value={whatsapp}
          onChangeText={setWhatsapp}
          keyboardType="phone-pad"
        />
        <CompactField editable={!loading}
          label="Viber"
          value={viber}
          onChangeText={setViber}
          keyboardType="phone-pad"
        />
        <CompactField editable={!loading}
          label="Telegram"
          value={telegram}
          onChangeText={setTelegram}
          autoCapitalize="none"
          placeholder="username"
        />
        <CompactField editable={!loading}
          label="VK"
          value={vk}
          onChangeText={setVk}
          autoCapitalize="none"
          placeholder="vk.com/username"
        />
        <CompactField editable={!loading}
          label="Instagram"
          value={instagram}
          onChangeText={setInstagram}
          autoCapitalize="none"
          placeholder="instagram.com/username"
        />
        <Button title="Сохранить" onPress={save} loading={loading} />
      </Surface>
      <ArtistRequisitesSection />
      <Surface>
        <SectionTitle>{hasPassword === false ? 'Установка пароля' : 'Смена пароля'}</SectionTitle>
        {passwordStatusLoading ? <Notice message="Проверяем состояние пароля…" /> : passwordStatusError ? <>
          <ErrorNotice message={passwordStatusError} />
          <Button title="Повторить" variant="secondary" onPress={() => void loadPasswordStatus()} disabled={loading} />
        </> : <>
          {!hasPassword && <Notice message="Установите пароль Ведело для входа по номеру телефона. Пароль от VK вводить не нужно." />}
          {hasPassword && <CompactField editable={!loading} label="Текущий пароль" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoCapitalize="none" />}
          <CompactField editable={!loading} label="Новый пароль" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" error={newPasswordError} />
          <CompactField editable={!loading} label="Повторите пароль" value={repeatPassword} onChangeText={setRepeatPassword} secureTextEntry autoCapitalize="none" error={repeatPasswordError} />
          <Button title={hasPassword ? 'Сменить пароль' : 'Установить пароль'} variant="secondary" onPress={changePassword} loading={loading} disabled={!passwordValid || loading} />
        </>}
      </Surface>
      {error ? <ErrorNotice message={error} /> : null}
      {message ? (
        <Notice tone="success" message={message} />
      ) : null}
      <Surface>
        <SectionTitle>Активные устройства</SectionTitle>
        {sessionsError ? <ErrorNotice message={sessionsError} /> : null}
        {sessionsError ? (
          <Button
            title="Повторить загрузку"
            variant="secondary"
            onPress={() => void loadSessions().catch(() => undefined)}
            loading={sessionsLoading}
          />
        ) : null}
        {sessionsLoading && !sessions.length ? (
          <Text style={styles.muted}>Загружаем список устройств…</Text>
        ) : null}
        {sessions.length ? (
          sessions.map((session) => (
            <View key={session._id} style={styles.device}>
              <View style={styles.sessionBody}>
                <Text style={styles.sessionTitle}>
                  {session.deviceName ||
                    (session.platform === 'android'
                      ? 'Android-устройство'
                      : session.platform || 'Устройство')}
                  {session.current ? ' · текущее' : ''}
                </Text>
                <Text style={styles.sessionMeta}>
                  {session.appVersion
                    ? `Ведело ${session.appVersion} · `
                    : ''}
                  активность {formatSessionDate(session.lastUsedAt)}
                </Text>
                <Text style={styles.sessionMeta}>
                  Сессия действует до {formatSessionDate(session.expiresAt)}
                </Text>
              </View>
              {!session.current ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Отключить ${session.deviceName || 'устройство'}`}
                  hitSlop={10}
                  style={{ minHeight: 40, justifyContent: 'center' }}
                  disabled={loading || sessionsLoading}
                  onPress={() => confirmRevoke(session)}
                >
                  <Text style={styles.revoke}>
                    {revokingSessionId === session._id
                      ? 'Отключаем…'
                      : 'Отключить'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ))
        ) : !sessionsLoading && !sessionsError ? (
          <Text style={styles.muted}>Активных устройств нет.</Text>
        ) : null}
      </Surface>
      <Button title="Выйти" variant="secondary" onPress={logout} disabled={loading} />
      <Button
        title="Удалить аккаунт"
        variant="danger"
        onPress={requestDeletion}
        disabled={loading}
      />
      <Text style={styles.disclaimer}>
        Запрос удаления также доступен на публичной странице Ведело без входа
        в приложение.
      </Text>
    </Screen>
  )
}

const createStyles = (palette: Palette) => StyleSheet.create({
  screenContent: { paddingBottom: 0 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.rowSelected,
  },
  avatarImage: { width: 56, height: 56 },
  avatarText: { color: palette.primary, fontSize: 30, fontWeight: '800' },
  avatarActions: { flex: 1, gap: 10 },
  removeAvatar: { color: palette.notice.danger.text, fontSize: 13, fontWeight: '700' },
  device: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  sessionBody: { flex: 1, gap: 2 },
  sessionTitle: {
    color: palette.text,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
  },
  sessionMeta: { color: palette.cardMuted, fontSize: 11, lineHeight: 17 },
  revoke: { color: palette.notice.danger.text, fontSize: 12, fontWeight: '700' },
  muted: { color: palette.cardMuted, fontSize: 13 },
  success: { color: palette.notice.success.text, fontSize: 13, fontWeight: '700' },
  disclaimer: {
    color: palette.cardMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
})
