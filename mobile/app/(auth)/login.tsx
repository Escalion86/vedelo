import { useEffect, useState } from 'react'
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { z } from 'zod'
import * as ExpoAuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import { api } from '../../src/shared/api/client'
import { useAuth } from '../../src/shared/auth/AuthProvider'
import {
  captureRegistrationReferrer,
  normalizeRegistrationReferrer,
} from '../../src/shared/auth/registrationReferral'
import type { AuthSession } from '../../src/shared/auth/types'
import { env } from '../../src/shared/config/env'
import {
  formatRussianPhone,
  normalizeRussianPhone,
} from '../../src/shared/format/phone'
import {
  Button,
  Screen,
  Surface,
} from '../../src/shared/ui/components'
import { CompactField } from '../../src/shared/ui/CompactField'
import { Notice } from '../../src/shared/ui/Notice'
import { useThemeStyles } from '../../src/shared/ui/ThemeProvider'
import { radius, spacing, type Palette } from '../../src/shared/ui/theme'

type Mode = 'login' | 'register' | 'recovery'
type Verification = { callId: number; authPhone?: string }

const credentialsSchema = z.object({
  phone: z.string().length(11, 'Введите корректный номер телефона'),
  password: z.string().min(8, 'Пароль должен быть не менее 8 символов'),
})

const webBaseUrl = env.apiBaseUrl.replace(/\/api\/?$/, '')
WebBrowser.maybeCompleteAuthSession()

const LegalConsentRow = ({
  checked, onToggle, prefix, link, url, disabled,
}: {
  checked: boolean
  onToggle: () => void
  prefix: string
  link: string
  url: string
  disabled: boolean
}) => {
  const styles = useThemeStyles(createStyles)
  return (
    <View>
      <Pressable
        style={({ pressed }) => [styles.consent, pressed && styles.pressed, disabled && styles.disabled]}
        accessibilityRole="checkbox"
        accessibilityLabel={`${prefix} ${link}`}
        accessibilityState={{ checked, disabled }}
        disabled={disabled}
        onPress={onToggle}
      >
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          <Text style={styles.checkmark}>{checked ? '✓' : ''}</Text>
        </View>
        <Text style={styles.consentText}>{prefix}</Text>
      </Pressable>
      <Text accessibilityRole="link" style={styles.consentLink} onPress={() => Linking.openURL(url)}>
        {link}
      </Text>
    </View>
  )
}

export default function LoginScreen() {
  const styles = useThemeStyles(createStyles)
  const { completeSignIn } = useAuth()
  const params = useLocalSearchParams<{ mode?: string; ref?: string }>()
  const referralId = normalizeRegistrationReferrer(params.ref)
  const [mode, setMode] = useState<Mode>(() =>
    params.mode === 'register' || referralId ? 'register' : 'login'
  )
  useEffect(() => {
    if (referralId) {
      setMode('register')
      captureRegistrationReferrer(referralId).catch(() => undefined)
    }
  }, [referralId])
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [passwordRepeat, setPasswordRepeat] = useState('')
  const [verification, setVerification] = useState<Verification | null>(null)
  const [smsMode, setSmsMode] = useState(false)
  const [smsCode, setSmsCode] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [personalDataAccepted, setPersonalDataAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const hasRegistrationConsents =
    termsAccepted && privacyAccepted && personalDataAccepted
  const redirectUri = ExpoAuthSession.makeRedirectUri({
    scheme: env.appScheme,
    path: 'auth/vk',
  })
  const [vkRequest, vkResult, promptVk] = ExpoAuthSession.useAuthRequest(
    {
      clientId: env.vkIdAppId || 'not-configured',
      responseType: ExpoAuthSession.ResponseType.Code,
      redirectUri,
      scopes: ['phone', 'email'],
      usePKCE: true,
    },
    { authorizationEndpoint: 'https://id.vk.ru/authorize' }
  )

  useEffect(() => {
    if (vkResult?.type !== 'success' || !vkResult.params.code) return
    setLoading(true)
    setError('')
    captureRegistrationReferrer(referralId)
      .then((referrerId) =>
        api.post<{ success: true; data: AuthSession }>(
          '/mobile/v1/auth/vk',
          {
            code: vkResult.params.code,
            device_id: vkResult.params.device_id,
            state: vkResult.params.state,
            code_verifier: vkRequest?.codeVerifier,
            mode,
            referrerId:
              mode === 'register' ? referrerId || undefined : undefined,
            consentTerms: mode === 'register' ? termsAccepted : undefined,
            consentPrivacyPolicy:
              mode === 'register' ? privacyAccepted : undefined,
            consentPersonalData:
              mode === 'register' ? personalDataAccepted : undefined,
          },
          { skipAuth: true, skipRefresh: true }
        )
      )
      .then(async (response) => {
        await completeSignIn(response.data)
        router.replace('/(tabs)')
      })
      .catch((reason) => {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Не удалось войти через VK ID'
        )
      })
      .finally(() => setLoading(false))
  }, [
    completeSignIn,
    mode,
    referralId,
    personalDataAccepted,
    privacyAccepted,
    termsAccepted,
    vkRequest?.codeVerifier,
    vkResult,
  ])

  const changeMode = (next: Mode) => {
    setMode(next)
    setVerification(null)
    setSmsMode(false)
    setError('')
  }

  const finish = async () => {
    const referrerId = await captureRegistrationReferrer(referralId)
    const path =
      mode === 'register'
        ? '/mobile/v1/auth/register'
        : '/mobile/v1/auth/recovery'
    const response = await api.post<{ success: true; data: AuthSession }>(
      path,
      {
        phone: normalizeRussianPhone(phone),
        password,
        referrerId: mode === 'register' ? referrerId || undefined : undefined,
        consentTerms: mode === 'register' ? termsAccepted : undefined,
        consentPrivacyPolicy: mode === 'register' ? privacyAccepted : undefined,
        consentPersonalData:
          mode === 'register' ? personalDataAccepted : undefined,
      },
      { skipAuth: true, skipRefresh: true }
    )
    await completeSignIn(response.data)
    router.replace('/(tabs)')
  }

  const submitCredentials = async () => {
    setError('')
    const normalizedPhone = normalizeRussianPhone(phone)
    const parsed = credentialsSchema.safeParse({
      phone: normalizedPhone,
      password,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Проверьте введённые данные')
      return
    }
    if (mode !== 'login' && password !== passwordRepeat) {
      setError('Пароли не совпадают')
      return
    }
    if (mode === 'register' && !hasRegistrationConsents) {
      setError('Для регистрации примите юридические согласия')
      return
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        const response = await api.post<{ success: true; data: AuthSession }>(
          '/mobile/v1/auth/login',
          { phone: normalizedPhone, password },
          { skipAuth: true, skipRefresh: true }
        )
        await completeSignIn(response.data)
        router.replace('/(tabs)')
        return
      }

      const response = await api.post<{
        success: true
        data: { id: number; auth_phone?: string }
      }>(
        '/phone/verify/start',
        { phone: normalizedPhone, flow: mode },
        { skipAuth: true, skipRefresh: true }
      )
      setVerification({
        callId: response.data.id,
        authPhone: response.data.auth_phone,
      })
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Не удалось выполнить запрос'
      )
    } finally {
      setLoading(false)
    }
  }

  const startVk = () => {
    setError('')
    if (mode === 'register' && !hasRegistrationConsents) {
      setError('Для регистрации через VK ID примите юридические согласия')
      return
    }
    promptVk()
  }

  const checkCall = async () => {
    if (!verification) return
    setLoading(true)
    setError('')
    try {
      const response = await api.post<{
        success: true
        data: { confirmed: boolean }
      }>(
        '/phone/verify/check',
        { phone: normalizeRussianPhone(phone), callId: verification.callId },
        { skipAuth: true, skipRefresh: true }
      )
      if (!response.data.confirmed) {
        setError(
          'Звонок ещё не подтверждён. Позвоните на указанный номер и повторите проверку.'
        )
        return
      }
      await finish()
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Не удалось проверить звонок'
      )
    } finally {
      setLoading(false)
    }
  }

  const sendSms = async () => {
    setLoading(true)
    setError('')
    try {
      await api.post(
        '/phone/verify/sms/send',
        { phone: normalizeRussianPhone(phone), flow: mode },
        { skipAuth: true, skipRefresh: true }
      )
      setSmsMode(true)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Не удалось отправить SMS'
      )
    } finally {
      setLoading(false)
    }
  }

  const checkSms = async () => {
    setLoading(true)
    setError('')
    try {
      await api.post(
        '/phone/verify/sms/check',
        { phone: normalizeRussianPhone(phone), flow: mode, code: smsCode },
        { skipAuth: true, skipRefresh: true }
      )
      await finish()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Неверный код')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen keyboardShouldPersistTaps="handled" contentStyle={styles.screen}>
      <View style={styles.hero}>
        <Image
          source={require('../../assets/images/brand-mark.png')}
          style={styles.brandMark}
          resizeMode="contain"
          alt=""
        />
        <Text style={styles.wordmark}>Ведело</Text>
      </View>

      <Surface>
        {mode === 'recovery' ? (
          <Text accessibilityRole="header" style={styles.recoveryTitle}>Восстановление доступа</Text>
        ) : (
          <View style={styles.segmented}>
            {(
              [
                ['login', 'Вход'],
                ['register', 'Регистрация'],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === value, disabled: loading }}
                disabled={loading}
                onPress={() => changeMode(value)}
                style={({ pressed }) => [styles.segment, mode === value && styles.segmentActive, pressed && styles.pressed, loading && styles.disabled]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    mode === value && styles.segmentTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {!verification ? (
          <>
            <CompactField editable={!loading}
              testID="auth-phone"
              label="Телефон"
              value={phone}
              onChangeText={(value) => setPhone(formatRussianPhone(value))}
              keyboardType="phone-pad"
              autoComplete="tel"
              placeholder="+7 (999) 000-00-00"
              maxLength={18}
            />
            <CompactField editable={!loading}
              testID="auth-password"
              label={mode === 'recovery' ? 'Новый пароль' : 'Пароль'}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
            />
            {mode !== 'login' ? (
              <CompactField editable={!loading}
                testID="Повторите пароль"
                label="Повторите пароль"
                value={passwordRepeat}
                onChangeText={setPasswordRepeat}
                secureTextEntry
              />
            ) : null}
            {mode === 'register' ? (
              <View style={styles.consents}>
                <LegalConsentRow
                  checked={termsAccepted}
                  onToggle={() => setTermsAccepted((value) => !value)}
                  prefix="Принимаю"
                  link="Пользовательское соглашение"
                  url={`${webBaseUrl}/terms`}
                  disabled={loading}
                />
                <LegalConsentRow
                  checked={privacyAccepted}
                  onToggle={() => setPrivacyAccepted((value) => !value)}
                  prefix="Ознакомился с"
                  link="Политикой обработки персональных данных"
                  url={`${webBaseUrl}/privacy`}
                  disabled={loading}
                />
                <LegalConsentRow
                  checked={personalDataAccepted}
                  onToggle={() => setPersonalDataAccepted((value) => !value)}
                  prefix="Отдельно даю"
                  link="согласие на обработку персональных данных"
                  url={`${webBaseUrl}/personal-data-consent`}
                  disabled={loading}
                />
              </View>
            ) : null}
            {error ? <Notice tone="danger" message={error} /> : null}
            <Button
              testID="submit-auth"
              title={mode === 'login' ? 'Войти' : 'Подтвердить телефон'}
              onPress={submitCredentials}
              loading={loading}
            />
            {mode !== 'recovery' && env.vkIdAppId ? (
              <Button
                testID="submit-vk-auth"
                title={
                  mode === 'register'
                    ? 'Зарегистрироваться через VK ID'
                    : 'Войти через VK ID'
                }
                variant="secondary"
                onPress={startVk}
                disabled={!vkRequest || loading}
              />
            ) : null}
          </>
        ) : (
          <>
            <Text accessibilityRole="header" style={styles.verifyTitle}>
              {smsMode ? 'Код из SMS' : 'Подтверждение звонком'}
            </Text>
            <Text style={styles.verifyText}>
              {smsMode
                ? 'Введите код, отправленный на ваш телефон.'
                : `Позвоните с номера ${phone} на ${verification.authPhone || 'номер, показанный сервисом'}. Звонок будет сброшен автоматически и останется бесплатным.`}
            </Text>
            {smsMode ? (
              <CompactField editable={!loading}
                label="Код"
                value={smsCode}
                onChangeText={setSmsCode}
                keyboardType="number-pad"
              />
            ) : null}
            {error ? <Notice tone="danger" message={error} /> : null}
            <Button
              title={smsMode ? 'Подтвердить код' : 'Я позвонил — проверить'}
              onPress={smsMode ? checkSms : checkCall}
              loading={loading}
            />
            {!smsMode ? (
              <Button
                title="Получить код по SMS"
                variant="secondary"
                onPress={sendSms}
                disabled={loading}
              />
            ) : null}
            <Button
              title="Изменить данные"
              variant="secondary"
              onPress={() => setVerification(null)}
              disabled={loading}
            />
          </>
        )}
      </Surface>

      <View style={styles.bottomActions}>
        {mode === 'login' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: loading }}
            disabled={loading}
            style={styles.bottomAction}
            hitSlop={10}
            onPress={() => changeMode('recovery')}
          >
            <Text style={styles.recoveryLink}>
              Забыли пароль? Восстановить доступ
            </Text>
          </Pressable>
        ) : null}
        {mode === 'recovery' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: loading }}
            disabled={loading}
            style={styles.bottomAction}
            hitSlop={10}
            onPress={() => changeMode('login')}
          >
            <Text style={styles.recoveryLink}>Вернуться ко входу</Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  )
}

const createStyles = (palette: Palette) => StyleSheet.create({
  screen: { gap: spacing.md },
  pressed: { backgroundColor: palette.rowPressed },
  disabled: { opacity: 0.65 },
  bottomAction: { minHeight: 40, justifyContent: 'center' },
  hero: {
    paddingTop: spacing.xl,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandMark: { width: 40, height: 52 },
  wordmark: {
    color: palette.text,
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -1.1,
  },
  segmented: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: palette.notice.neutral.background,
    borderRadius: radius.md,
    padding: 3,
  },
  segment: {
    flexGrow: 1,
    flexBasis: 100,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: 5,
  },
  segmentActive: { backgroundColor: palette.surface },
  segmentText: { color: palette.cardMuted, fontSize: 12, fontWeight: '700' },
  segmentTextActive: { color: palette.text },
  recoveryTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 5,
  },
  consents: { gap: spacing.sm },
  consent: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  checkmark: { color: palette.onPrimary, fontSize: 14, fontWeight: '800' },
  consentText: {
    flex: 1,
    color: palette.cardMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  consentLink: { minHeight: 40, marginLeft: 30, paddingVertical: 8, color: palette.primary, fontSize: 13, lineHeight: 19, textDecorationLine: 'underline' },
  verifyTitle: { color: palette.text, fontSize: 20, fontWeight: '700' },
  verifyText: { color: palette.cardMuted, fontSize: 14, lineHeight: 21 },
  bottomActions: {
    marginTop: 'auto',
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  recoveryLink: {
    color: palette.cardMuted,
    fontSize: 12,
    lineHeight: 18,
    textDecorationLine: 'underline',
  },
})
