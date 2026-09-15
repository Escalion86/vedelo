import { useEffect, useState, type ReactNode } from 'react'
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { z } from 'zod'
import * as ExpoAuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import { api } from '../../src/shared/api/client'
import { useAuth } from '../../src/shared/auth/AuthProvider'
import type { AuthSession } from '../../src/shared/auth/types'
import { env } from '../../src/shared/config/env'
import {
  formatRussianPhone,
  normalizeRussianPhone,
} from '../../src/shared/format/phone'
import {
  Button,
  ErrorNotice,
  Field,
  Screen,
  Surface,
} from '../../src/shared/ui/components'
import { colors, radius, spacing } from '../../src/shared/ui/theme'

type Mode = 'login' | 'register' | 'recovery'
type Verification = { callId: number; authPhone?: string }

const credentialsSchema = z.object({
  phone: z.string().length(11, 'Введите корректный номер телефона'),
  password: z.string().min(8, 'Пароль должен быть не менее 8 символов'),
})

const webBaseUrl = env.apiBaseUrl.replace(/\/api\/?$/, '')
WebBrowser.maybeCompleteAuthSession()

const LegalConsentRow = ({
  checked,
  onToggle,
  children,
}: {
  checked: boolean
  onToggle: () => void
  children: ReactNode
}) => (
  <Pressable style={styles.consent} onPress={onToggle}>
    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
      <Text style={styles.checkmark}>{checked ? '✓' : ''}</Text>
    </View>
    <Text style={styles.consentText}>{children}</Text>
  </Pressable>
)

export default function LoginScreen() {
  const { completeSignIn } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
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
    api
      .post<{ success: true; data: AuthSession }>(
        '/mobile/v1/auth/vk',
        {
          code: vkResult.params.code,
          device_id: vkResult.params.device_id,
          state: vkResult.params.state,
          code_verifier: vkRequest?.codeVerifier,
          mode,
          consentTerms: mode === 'register' ? termsAccepted : undefined,
          consentPrivacyPolicy:
            mode === 'register' ? privacyAccepted : undefined,
          consentPersonalData:
            mode === 'register' ? personalDataAccepted : undefined,
        },
        { skipAuth: true, skipRefresh: true }
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
    const path =
      mode === 'register'
        ? '/mobile/v1/auth/register'
        : '/mobile/v1/auth/recovery'
    const response = await api.post<{ success: true; data: AuthSession }>(
      path,
      {
        phone: normalizeRussianPhone(phone),
        password,
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
    <Screen>
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
          <Text style={styles.recoveryTitle}>Восстановление доступа</Text>
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
                onPress={() => changeMode(value)}
                style={[styles.segment, mode === value && styles.segmentActive]}
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
            <Field
              testID="auth-phone"
              label="Телефон"
              value={phone}
              onChangeText={(value) => setPhone(formatRussianPhone(value))}
              keyboardType="phone-pad"
              autoComplete="tel"
              placeholder="+7 (999) 000-00-00"
              maxLength={18}
            />
            <Field
              testID="auth-password"
              label={mode === 'recovery' ? 'Новый пароль' : 'Пароль'}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
            />
            {mode !== 'login' ? (
              <Field
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
                >
                  Принимаю{' '}
                  <Text
                    style={styles.link}
                    onPress={() => Linking.openURL(`${webBaseUrl}/terms`)}
                  >
                    Пользовательское соглашение
                  </Text>
                </LegalConsentRow>
                <LegalConsentRow
                  checked={privacyAccepted}
                  onToggle={() => setPrivacyAccepted((value) => !value)}
                >
                  Ознакомился с{' '}
                  <Text
                    style={styles.link}
                    onPress={() => Linking.openURL(`${webBaseUrl}/privacy`)}
                  >
                    Политикой обработки персональных данных
                  </Text>
                </LegalConsentRow>
                <LegalConsentRow
                  checked={personalDataAccepted}
                  onToggle={() => setPersonalDataAccepted((value) => !value)}
                >
                  Отдельно даю{' '}
                  <Text
                    style={styles.link}
                    onPress={() =>
                      Linking.openURL(`${webBaseUrl}/personal-data-consent`)
                    }
                  >
                    согласие на обработку персональных данных
                  </Text>
                </LegalConsentRow>
              </View>
            ) : null}
            {error ? <ErrorNotice message={error} /> : null}
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
            <Text style={styles.verifyTitle}>
              {smsMode ? 'Код из SMS' : 'Подтверждение звонком'}
            </Text>
            <Text style={styles.verifyText}>
              {smsMode
                ? 'Введите код, отправленный на ваш телефон.'
                : `Позвоните с номера ${phone} на ${verification.authPhone || 'номер, показанный сервисом'}. Звонок будет сброшен автоматически и останется бесплатным.`}
            </Text>
            {smsMode ? (
              <Field
                label="Код"
                value={smsCode}
                onChangeText={setSmsCode}
                keyboardType="number-pad"
              />
            ) : null}
            {error ? <ErrorNotice message={error} /> : null}
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

const styles = StyleSheet.create({
  hero: {
    paddingTop: spacing.xl,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandMark: { width: 40, height: 52 },
  wordmark: {
    color: colors.text,
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -1.1,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: 3,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: 5,
  },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  segmentTextActive: { color: colors.text },
  recoveryTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 5,
  },
  consents: { gap: spacing.sm },
  consent: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '800' },
  consentText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  link: { color: colors.primary, textDecorationLine: 'underline' },
  verifyTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  verifyText: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  bottomActions: {
    marginTop: 'auto',
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  recoveryLink: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textDecorationLine: 'underline',
  },
})
