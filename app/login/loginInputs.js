'use client'

import Link from 'next/link'
import Image from 'next/image'
import { signIn } from 'next-auth/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import Input from '@components/Input'
import PhoneInput from '@components/PhoneInput'
import { reachGoal, reachGoalOnce } from '@helpers/metrikaGoals'

const normalizePhone = (value) => {
  if (!value) return ''
  const digits = String(value).replace(/[^\d]/g, '')
  if (digits.length === 10) return `7${digits}`
  if (digits.length === 11 && digits.startsWith('8'))
    return `7${digits.slice(1)}`
  return digits
}

const formatPhoneForDisplay = (value) => {
  const digits = String(value || '').replace(/[^\d]/g, '')
  if (digits.length === 11) {
    const normalized = digits.startsWith('8') ? `7${digits.slice(1)}` : digits
    const local = normalized.slice(1)
    return `+7 (${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(
      6,
      8
    )}-${local.slice(8, 10)}`
  }
  return value || ''
}

const getPhoneForTel = (value) => {
  const digits = String(value || '').replace(/[^\d]/g, '')
  if (digits.length !== 11) return ''
  if (digits.startsWith('8')) return `+7${digits.slice(1)}`
  if (digits.startsWith('7')) return `+${digits}`
  return ''
}

const createVerifyState = () => ({
  callId: null,
  status: 'idle',
  verified: false,
  authPhone: '',
  urlImage: '',
  smsRequested: false,
  smsCode: '',
  debugCode: '',
  loadingStart: false,
  loadingCheck: false,
  loadingSmsSend: false,
  loadingSmsCheck: false,
  smsAvailableAt: null,
  smsReady: false,
})

const getErrorMessage = (json, fallback) =>
  json?.error?.message || json?.error || fallback

const getVkAuthErrorCode = (json) =>
  json?.error?.code || (typeof json?.error === 'string' ? json.error : '')

const getVkAuthErrorMessage = (json) => {
  const code = getVkAuthErrorCode(json)
  if (code === 'VK_PROFILE_NOT_FOUND') return 'Профиль VK не найден'
  if (code === 'VK_PHONE_REQUIRED')
    return 'VK ID не передал номер телефона. Проверьте настройки профиля VK.'
  if (code === 'VK_CONFIG_MISSING')
    return 'Авторизация VK ID временно недоступна'
  if (code === 'VK_EXCHANGE_FAILED')
    return 'Не удалось подтвердить вход через VK ID'
  if (code === 'VK_USERINFO_FAILED') return 'Не удалось получить профиль VK ID'
  if (code === 'VK_USER_CREATE_FAILED')
    return 'Не удалось создать аккаунт через VK ID'
  if (code === 'VK_USER_DUPLICATE_CONFLICT')
    return 'Конфликт данных аккаунта. Обратитесь в поддержку'
  if (code === 'AUTH_SECRET_NOT_SET')
    return 'Ошибка конфигурации авторизации на сервере'
  if (code === 'INVALID_VK_PAYLOAD') return 'Некорректные данные VK ID'
  return getErrorMessage(json, 'VK ID auth failed')
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  return { res, json }
}

const LegalConsent = ({ checked, onChange, children }) => (
  <label className="flex cursor-pointer items-start gap-2 text-xs text-gray-600">
    <input
      type="checkbox"
      className="mt-1 h-4 w-4 cursor-pointer"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span>{children}</span>
  </label>
)

const RegistrationLegalConsents = ({
  termsAccepted,
  onTermsAcceptedChange,
  privacyAccepted,
  onPrivacyAcceptedChange,
  personalDataAccepted,
  onPersonalDataAcceptedChange,
}) => (
  <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
    <LegalConsent checked={termsAccepted} onChange={onTermsAcceptedChange}>
      Я принимаю{' '}
      <Link
        href="/terms"
        className="text-general"
        target="_blank"
        rel="noreferrer"
      >
        Пользовательское соглашение
      </Link>
      .
    </LegalConsent>
    <LegalConsent checked={privacyAccepted} onChange={onPrivacyAcceptedChange}>
      Я ознакомился с{' '}
      <Link
        href="/privacy"
        className="text-general"
        target="_blank"
        rel="noreferrer"
      >
        Политикой обработки персональных данных
      </Link>
      .
    </LegalConsent>
    <LegalConsent
      checked={personalDataAccepted}
      onChange={onPersonalDataAcceptedChange}
    >
      Я отдельно даю{' '}
      <Link
        href="/personal-data-consent"
        className="text-general"
        target="_blank"
        rel="noreferrer"
      >
        согласие на обработку персональных данных
      </Link>
      .
    </LegalConsent>
  </div>
)

function validate_login(
  event,
  phone,
  password,
  setSubmitting,
  phoneDigits,
  setPhoneHint,
  callbackUrl
) {
  event.preventDefault()
  if (!phone || !password) return
  setPhoneHint(false)
  setSubmitting(true)

  signIn('credentials', {
    phone,
    password,
    redirect: false,
  })
    .then((result) => {
      if (result?.error) {
        if (phoneDigits !== 11) {
          setPhoneHint(true)
        }
        alert('Неверный телефон или пароль')
      } else {
        reachGoal('login_success', { method: 'credentials' })
        window.location.replace(callbackUrl)
      }
    })
    .catch((err) => {
      alert(`Error Occured: ${err}`)
    })
    .finally(() => {
      setSubmitting(false)
    })
}

const LoginInputs = ({
  callbackUrl = '/cabinet',
  initialMode = 'login',
  initialReferrerId = '',
}) => {
  const vkOneTapContainerRef = useRef(null)
  const [vkConfig, setVkConfig] = useState({
    loaded: false,
    allowVkAuth: false,
    appId: '',
    redirectUri: '',
    scope: 'phone email',
    debug: false,
  })
  const [vkLoading, setVkLoading] = useState(false)
  const [vkRenderNonce, setVkRenderNonce] = useState(0)
  const [mode, setMode] = useState(
    initialMode === 'register' ? 'register' : 'login'
  )
  const vkAuthEnabled = vkConfig.loaded && vkConfig.allowVkAuth
  const [loginPhone, setLoginPhone] = useState(null)
  const [loginPassword, setLoginPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [resetPhone, setResetPhone] = useState(null)
  const [resetPassword, setResetPassword] = useState('')
  const [isResetLoading, setIsResetLoading] = useState(false)
  const [resetVerify, setResetVerify] = useState(createVerifyState)

  const [registerPhone, setRegisterPhone] = useState(null)
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerPasswordRepeat, setRegisterPasswordRepeat] = useState('')
  const [isRegisterLoading, setIsRegisterLoading] = useState(false)
  const [registerTermsAccepted, setRegisterTermsAccepted] = useState(false)
  const [registerPrivacyAccepted, setRegisterPrivacyAccepted] = useState(false)
  const [registerPersonalDataAccepted, setRegisterPersonalDataAccepted] =
    useState(false)
  const [registerVerify, setRegisterVerify] = useState(createVerifyState)

  const [loginPhoneHint, setLoginPhoneHint] = useState(false)
  const [resetPhoneHint, setResetPhoneHint] = useState(false)
  const [registerPhoneHint, setRegisterPhoneHint] = useState(false)

  const hasRegistrationConsents =
    registerTermsAccepted &&
    registerPrivacyAccepted &&
    registerPersonalDataAccepted
  const canUseVkOneTap =
    mode === 'login' || (mode === 'register' && hasRegistrationConsents)

  const loginPhoneDigits = String(normalizePhone(loginPhone)).length
  const resetPhoneDigits = String(normalizePhone(resetPhone)).length
  const registerPhoneDigits = String(normalizePhone(registerPhone)).length

  const resetPhoneNormalized = useMemo(
    () => normalizePhone(resetPhone),
    [resetPhone]
  )
  const registerPhoneNormalized = useMemo(
    () => normalizePhone(registerPhone),
    [registerPhone]
  )

  useEffect(() => {
    if (initialMode !== 'register') return
    reachGoal('registration_page_open', { entry: 'landing' })
  }, [initialMode])

  const startVerification = async ({
    flow,
    phone,
    setPhoneHint,
    setVerifyState,
  }) => {
    if (String(phone).length !== 11) {
      setPhoneHint(true)
      return
    }

    if (flow === 'register') {
      reachGoalOnce('registration_start', { method: 'phone' })
    }

    setVerifyState((prev) => ({
      ...prev,
      loadingStart: true,
      verified: false,
    }))

    try {
      const { res, json } = await postJson('/api/phone/verify/start', {
        phone,
        flow,
      })

      if (!res.ok || json?.success === false) {
        alert(getErrorMessage(json, 'Не удалось начать подтверждение телефона'))
        return
      }

      setVerifyState((prev) => ({
        ...prev,
        callId: json?.data?.id ?? null,
        status: 'pending',
        verified: false,
        authPhone: json?.data?.auth_phone ?? '',
        urlImage: json?.data?.url_image ?? '',
        smsRequested: false,
        smsCode: '',
        debugCode: '',
        smsAvailableAt: Date.now() + 60 * 1000,
        smsReady: false,
      }))
    } catch (error) {
      alert('Не удалось начать подтверждение телефона')
    } finally {
      setVerifyState((prev) => ({ ...prev, loadingStart: false }))
    }
  }

  const checkVerification = async ({
    flow,
    phone,
    callId,
    setVerifyState,
    silent = false,
  }) => {
    if (!callId) return

    if (!silent) {
      setVerifyState((prev) => ({ ...prev, loadingCheck: true }))
    }

    try {
      const { res, json } = await postJson('/api/phone/verify/check', {
        phone,
        flow,
        callId,
      })

      if (!res.ok || json?.success === false) {
        if (!silent && json?.error?.code !== 'CHECK_RATE_LIMIT') {
          alert(getErrorMessage(json, 'Не удалось проверить звонок'))
        }
        return
      }

      const status = json?.data?.status || 'pending'
      const confirmed = Boolean(json?.data?.confirmed)

      if (flow === 'register' && confirmed) {
        reachGoalOnce('registration_phone_verified', { method: 'call' })
      }

      setVerifyState((prev) => ({
        ...prev,
        status,
        verified: confirmed,
      }))
    } catch (error) {
      if (!silent) {
        alert('Не удалось проверить звонок')
      }
    } finally {
      if (!silent) {
        setVerifyState((prev) => ({ ...prev, loadingCheck: false }))
      }
    }
  }

  const sendSmsFallback = async ({ flow, phone, setVerifyState }) => {
    setVerifyState((prev) => ({ ...prev, loadingSmsSend: true }))

    try {
      const { res, json } = await postJson('/api/phone/verify/sms/send', {
        phone,
        flow,
      })

      if (!res.ok || json?.success === false) {
        alert(getErrorMessage(json, 'Не удалось отправить SMS-код'))
        return
      }

      setVerifyState((prev) => ({
        ...prev,
        smsRequested: true,
        debugCode: json?.data?.debugCode ?? '',
        smsAvailableAt: Date.now() + 60 * 1000,
        smsReady: false,
      }))

      alert('SMS-код отправлен')
    } catch (error) {
      alert('Не удалось отправить SMS-код')
    } finally {
      setVerifyState((prev) => ({ ...prev, loadingSmsSend: false }))
    }
  }

  const checkSmsCode = async ({ flow, phone, code, setVerifyState }) => {
    if (!String(code || '').trim()) {
      alert('Введите код из SMS')
      return
    }

    setVerifyState((prev) => ({ ...prev, loadingSmsCheck: true }))

    try {
      const { res, json } = await postJson('/api/phone/verify/sms/check', {
        phone,
        flow,
        code,
      })

      if (!res.ok || json?.success === false) {
        alert(getErrorMessage(json, 'Неверный код'))
        return
      }

      if (flow === 'register') {
        reachGoalOnce('registration_phone_verified', { method: 'sms' })
      }

      setVerifyState((prev) => ({
        ...prev,
        verified: true,
        status: 'ok',
      }))
    } catch (error) {
      alert('Не удалось проверить SMS-код')
    } finally {
      setVerifyState((prev) => ({ ...prev, loadingSmsCheck: false }))
    }
  }

  const submitReset = async (event) => {
    event.preventDefault()

    if (!resetPhone) return

    if (!resetVerify.verified) {
      await startVerification({
        flow: 'recovery',
        phone: resetPhoneNormalized,
        setPhoneHint: setResetPhoneHint,
        setVerifyState: setResetVerify,
      })
      return
    }

    if (!resetPassword) return
    if (String(resetPassword).length < 8) {
      alert('Пароль должен быть не менее 8 символов')
      return
    }

    setIsResetLoading(true)

    try {
      const { res, json } = await postJson('/api/phone/verify/finalize', {
        phone: resetPhoneNormalized,
        password: resetPassword,
        flow: 'recovery',
      })

      if (!res.ok || json?.success === false) {
        alert(getErrorMessage(json, 'Не удалось восстановить пароль'))
        return
      }

      alert('Пароль обновлен. Войдите с новым паролем.')
      setResetPhone('')
      setResetPassword('')
      setResetVerify(createVerifyState())
      setMode('login')
    } catch (error) {
      alert('Не удалось восстановить пароль')
    } finally {
      setIsResetLoading(false)
    }
  }

  const submitRegister = async (event) => {
    event.preventDefault()

    if (!registerPhone) return

    if (!registerVerify.verified) {
      await startVerification({
        flow: 'register',
        phone: registerPhoneNormalized,
        setPhoneHint: setRegisterPhoneHint,
        setVerifyState: setRegisterVerify,
      })
      return
    }

    if (!registerPassword || !registerPasswordRepeat) return

    if (!registerTermsAccepted) {
      alert('Необходимо принять Пользовательское соглашение')
      return
    }

    if (!registerPrivacyAccepted) {
      alert('Необходимо принять Политику конфиденциальности')
      return
    }

    if (!registerPersonalDataAccepted) {
      alert('Необходимо дать согласие на обработку персональных данных')
      return
    }

    if (registerPassword !== registerPasswordRepeat) {
      alert('Пароли не совпадают')
      return
    }

    if (String(registerPassword).length < 8) {
      alert('Пароль должен быть не менее 8 символов')
      return
    }

    setIsRegisterLoading(true)

    try {
      const { res, json } = await postJson('/api/phone/verify/finalize', {
        phone: registerPhoneNormalized,
        password: registerPassword,
        flow: 'register',
        consentTerms: registerTermsAccepted,
        consentPrivacyPolicy: registerPrivacyAccepted,
        consentPersonalData: registerPersonalDataAccepted,
        consentToMailing: false,
        referrerId: initialReferrerId || undefined,
      })

      if (!res.ok || json?.success === false) {
        alert(getErrorMessage(json, 'Не удалось зарегистрироваться'))
        return
      }

      const signInResult = await signIn('credentials', {
        phone: registerPhoneNormalized,
        password: registerPassword,
        redirect: false,
      })

      if (signInResult?.error) {
        reachGoalOnce('registration_success', { method: 'phone' })
        alert('Регистрация успешна. Войдите в кабинет.')
        setRegisterPhone(null)
        setRegisterPassword('')
        setRegisterPasswordRepeat('')
        setRegisterTermsAccepted(false)
        setRegisterPrivacyAccepted(false)
        setRegisterPersonalDataAccepted(false)
        setRegisterVerify(createVerifyState())
        setMode('login')
        return
      }

      reachGoalOnce('registration_success', { method: 'phone' })
      window.location.replace(callbackUrl)
    } catch (error) {
      alert('Не удалось зарегистрироваться')
    } finally {
      setIsRegisterLoading(false)
    }
  }

  useEffect(() => {
    if (!registerVerify.smsAvailableAt || registerVerify.smsReady) return
    const delayMs = Math.max(
      0,
      Number(registerVerify.smsAvailableAt) - Date.now()
    )
    const timer = setTimeout(() => {
      setRegisterVerify((prev) => ({ ...prev, smsReady: true }))
    }, delayMs)
    return () => clearTimeout(timer)
  }, [registerVerify.smsAvailableAt, registerVerify.smsReady])

  useEffect(() => {
    if (!resetVerify.smsAvailableAt || resetVerify.smsReady) return
    const delayMs = Math.max(0, Number(resetVerify.smsAvailableAt) - Date.now())
    const timer = setTimeout(() => {
      setResetVerify((prev) => ({ ...prev, smsReady: true }))
    }, delayMs)
    return () => clearTimeout(timer)
  }, [resetVerify.smsAvailableAt, resetVerify.smsReady])

  useEffect(() => {
    if (!registerVerify.callId || registerVerify.verified) return
    if (registerVerify.status === 'expired') return

    const interval = setInterval(() => {
      checkVerification({
        flow: 'register',
        phone: registerPhoneNormalized,
        callId: registerVerify.callId,
        setVerifyState: setRegisterVerify,
        silent: true,
      })
    }, 3000)

    return () => clearInterval(interval)
  }, [
    registerVerify.callId,
    registerVerify.verified,
    registerVerify.status,
    registerPhoneNormalized,
  ])

  useEffect(() => {
    if (!resetVerify.callId || resetVerify.verified) return
    if (resetVerify.status === 'expired') return

    const interval = setInterval(() => {
      checkVerification({
        flow: 'recovery',
        phone: resetPhoneNormalized,
        callId: resetVerify.callId,
        setVerifyState: setResetVerify,
        silent: true,
      })
    }, 3000)

    return () => clearInterval(interval)
  }, [
    resetVerify.callId,
    resetVerify.verified,
    resetVerify.status,
    resetPhoneNormalized,
  ])

  const VerificationBlock = ({ flow, phone, verifyState, setVerifyState }) => (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
      <div className="font-medium text-gray-900">Подтверждение телефона</div>
      {!verifyState.callId && (
        <div className="mt-2 text-gray-600">
          Нажмите на кнопку ниже, чтобы получить подтверждающий звонок.
        </div>
      )}

      {verifyState.callId && !verifyState.verified && (
        <div className="mt-2 flex flex-col gap-2">
          {verifyState.authPhone && (
            <div className="rounded-md bg-white p-3 text-sm text-gray-800">
              Подтвердите номер телефона, позвонив на{' '}
              <span className="font-semibold text-black">
                {formatPhoneForDisplay(verifyState.authPhone)}
              </span>
              . Звонок бесплатный.
            </div>
          )}
          {verifyState.urlImage && (
            <div className="hidden md:block">
              <div className="mb-2 text-xs text-gray-600">
                Или отсканируйте QR-код:
              </div>
              <div className="inline-flex rounded-md bg-white p-2">
                <Image
                  src={verifyState.urlImage}
                  alt="QR-код для подтверждения телефона"
                  width={120}
                  height={120}
                  className="h-[120px] w-[120px]"
                  unoptimized
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {getPhoneForTel(verifyState.authPhone) && (
              <a
                href={`tel:${getPhoneForTel(verifyState.authPhone)}`}
                className="ui-btn ui-btn-secondary w-full cursor-pointer rounded-md"
              >
                Позвонить
              </a>
            )}

            {!verifyState.smsReady && (
              <div className="w-full text-center text-xs text-gray-500">
                Кнопка SMS станет доступна через 60 секунд.
              </div>
            )}

            {verifyState.smsReady && (
              <button
                type="button"
                className="ui-btn ui-btn-secondary w-full cursor-pointer rounded-md"
                onClick={() => sendSmsFallback({ flow, phone, setVerifyState })}
                disabled={verifyState.loadingSmsSend}
              >
                {verifyState.loadingSmsSend
                  ? 'Отправка SMS...'
                  : 'Получить код по SMS'}
              </button>
            )}
          </div>
        </div>
      )}

      {verifyState.smsRequested && !verifyState.verified && (
        <div className="mt-3 flex flex-col gap-2">
          <Input
            label="Код из SMS"
            value={verifyState.smsCode}
            onChange={(value) =>
              setVerifyState((prev) => ({
                ...prev,
                smsCode: String(value || ''),
              }))
            }
            className="w-full"
            noMargin
          />

          {verifyState.debugCode && (
            <div className="text-[11px] text-gray-500">
              Тестовый код (dev):{' '}
              <span className="font-semibold">{verifyState.debugCode}</span>
            </div>
          )}

          <button
            type="button"
            className="cursor-pointer self-start rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
            onClick={() =>
              checkSmsCode({
                flow,
                phone,
                code: verifyState.smsCode,
                setVerifyState,
              })
            }
            disabled={verifyState.loadingSmsCheck}
          >
            {verifyState.loadingSmsCheck ? 'Проверка...' : 'Подтвердить код'}
          </button>
        </div>
      )}

      {verifyState.verified && (
        <div className="mt-2 font-medium text-green-700">
          Телефон подтвержден
        </div>
      )}
    </div>
  )

  useEffect(() => {
    let isMounted = true

    fetch('/api/global/auth/vk-status', { cache: 'no-store' })
      .then((response) => response.json())
      .then((json) => {
        if (!isMounted) return
        setVkConfig({
          loaded: true,
          allowVkAuth: Boolean(json?.data?.allowVkAuth),
          appId: json?.data?.appId || '',
          redirectUri: json?.data?.redirectUri || '',
          scope: json?.data?.scope || 'phone email',
          debug: Boolean(json?.data?.debug),
        })
      })
      .catch(() => {
        if (!isMounted) return
        setVkConfig((prev) => ({ ...prev, loaded: true, allowVkAuth: false }))
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!vkAuthEnabled || !canUseVkOneTap) return
    if (typeof window === 'undefined') return
    const appId = Number(vkConfig.appId || 0)
    if (!Number.isFinite(appId) || appId <= 0) return
    const redirectUrl =
      vkConfig.redirectUri || `${window.location.origin}/api/vk-id/callback`
    const container = vkOneTapContainerRef.current
    if (!container) return
    container.innerHTML = ''

    let isMounted = true
    const scriptId = 'vkid-sdk-script'

    const bootstrapVkOneTap = () => {
      if (!isMounted || !('VKIDSDK' in window)) return
      const VKID = window.VKIDSDK

      try {
        VKID.Config.init({
          app: appId,
          redirectUrl,
          responseMode: VKID.ConfigResponseMode.Callback,
          source: VKID.ConfigSource.LOWCODE,
          scope: vkConfig.scope || 'phone email',
        })

        const oneTap = new VKID.OneTap()
        oneTap
          .render({
            container,
            showAlternativeLogin: true,
          })
          .on(VKID.WidgetEvents.ERROR, (error) => {
            console.error('[VK One Tap] render error', error)
          })
          .on(VKID.OneTapInternalEvents.LOGIN_SUCCESS, async (payload) => {
            try {
              setVkLoading(true)
              const code = payload?.code
              const deviceId = payload?.device_id
              if (vkConfig.debug) {
                console.log('[VK One Tap debug] LOGIN_SUCCESS payload', {
                  keys: Object.keys(payload || {}),
                  hasCode: Boolean(code),
                  hasDeviceId: Boolean(deviceId),
                  hasCodeVerifier: Boolean(
                    payload?.code_verifier || payload?.codeVerifier
                  ),
                  hasState: Boolean(payload?.state),
                  type: payload?.type || '',
                })
              }
              if (!code || !deviceId) {
                throw new Error('VKID payload is missing code/device_id')
              }

              const codeVerifier =
                payload?.code_verifier || payload?.codeVerifier || ''
              let accessToken = ''
              let idToken = ''
              if (!codeVerifier && VKID?.Auth?.exchangeCode) {
                const exchangeData = await VKID.Auth.exchangeCode(
                  code,
                  deviceId
                )
                accessToken =
                  exchangeData?.access_token || exchangeData?.accessToken || ''
                idToken = exchangeData?.id_token || exchangeData?.idToken || ''
                if (vkConfig.debug) {
                  console.log('[VK One Tap debug] client exchange result', {
                    keys: Object.keys(exchangeData || {}),
                    hasAccessToken: Boolean(accessToken),
                    hasIdToken: Boolean(idToken),
                    hasUserId: Boolean(
                      exchangeData?.user_id || exchangeData?.userId
                    ),
                    hasEmail: Boolean(exchangeData?.email),
                    hasPhone: Boolean(
                      exchangeData?.phone || exchangeData?.phone_number
                    ),
                    scope: exchangeData?.scope || '',
                  })
                }
              }

              const authResponse = await fetch('/api/vk-id/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  code,
                  deviceId,
                  codeVerifier,
                  accessToken,
                  idToken,
                  state: payload?.state || '',
                  mode,
                  consentTerms:
                    mode === 'register' ? registerTermsAccepted : undefined,
                  consentPrivacyPolicy:
                    mode === 'register' ? registerPrivacyAccepted : undefined,
                  consentPersonalData:
                    mode === 'register'
                      ? registerPersonalDataAccepted
                      : undefined,
                  referrerId:
                    mode === 'register'
                      ? initialReferrerId || undefined
                      : undefined,
                }),
              })
              const authJson = await authResponse.json().catch(() => ({}))
              if (!authResponse.ok || authJson?.success === false) {
                const message = getVkAuthErrorMessage(authJson)
                const code = getVkAuthErrorCode(authJson)
                throw new Error(code ? `${message} (${code})` : message)
              }

              const token = authJson?.data?.authToken
              if (!token) throw new Error('VK ID token missing')

              const result = await signIn('vkid', {
                token,
                redirect: false,
              })
              if (result?.error) throw new Error(result.error)
              if (mode === 'register') {
                reachGoalOnce('registration_success', { method: 'vkid' })
              } else {
                reachGoal('login_success', { method: 'vkid' })
              }
              window.location.replace(callbackUrl)
            } catch (error) {
              console.error('[VK One Tap] auth error', error)
              alert(error?.message || 'Не удалось авторизоваться через VK ID')
              if (isMounted) setVkRenderNonce((prev) => prev + 1)
            } finally {
              if (isMounted) setVkLoading(false)
            }
          })
      } catch (error) {
        console.error('[VK One Tap] bootstrap error', error)
      }
    }

    const existingScript = document.getElementById(scriptId)
    if (existingScript) {
      bootstrapVkOneTap()
      return () => {
        isMounted = false
      }
    }

    const script = document.createElement('script')
    script.id = scriptId
    script.src = 'https://unpkg.com/@vkid/sdk@2.6.5/dist-sdk/umd/index.js'
    script.async = true
    script.onload = () => bootstrapVkOneTap()
    script.onerror = () => {
      console.error('[VK One Tap] sdk load failed')
    }
    document.head.appendChild(script)

    return () => {
      isMounted = false
    }
  }, [
    callbackUrl,
    canUseVkOneTap,
    initialReferrerId,
    mode,
    registerPersonalDataAccepted,
    registerPrivacyAccepted,
    registerTermsAccepted,
    vkAuthEnabled,
    vkConfig,
    vkRenderNonce,
  ])

  const VkAuthBlock = ({ label }) =>
    vkAuthEnabled ? (
      <div className="flex flex-col gap-2">
        <div className="text-center text-xs text-gray-500">{label}</div>
        {canUseVkOneTap ? (
          <div ref={vkOneTapContainerRef} className="w-full" />
        ) : (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-900">
            Примите документы выше, чтобы зарегистрироваться через VK ID.
          </div>
        )}
        {vkLoading ? (
          <div className="text-center text-xs text-gray-500">
            Авторизация VK ID...
          </div>
        ) : null}
      </div>
    ) : null

  return (
    <div className="relative flex min-h-[100dvh] w-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#f7efe1] via-[#ebd3a5] to-[#d8ba86] px-4 py-10">
      <div className="pointer-events-none absolute top-12 -left-28 h-64 w-64 rounded-full bg-[#ebd3a5]/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-28 bottom-12 h-64 w-64 rounded-full bg-[#c9a86a]/30 blur-3xl" />

      <div className="ring-general/30 relative z-10 w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl ring-1">
        <div className="mb-6">
          <div className="text-general text-xs tracking-[0.2em] uppercase">
            Ведело
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">
            {mode === 'login'
              ? 'Вход в кабинет'
              : mode === 'reset'
                ? 'Восстановление пароля'
                : 'Регистрация'}
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            {mode === 'login'
              ? vkAuthEnabled
                ? 'Войдите через VK ID или используйте телефон и пароль.'
                : 'Введите телефон и пароль, чтобы продолжить работу.'
              : mode === 'reset'
                ? 'Подтвердите номер и задайте новый пароль.'
                : vkAuthEnabled
                  ? 'Зарегистрируйтесь через VK ID или подтвердите телефон вручную.'
                  : 'Подтвердите номер телефона и создайте аккаунт.'}
          </p>
        </div>

        {mode === 'login' ? (
          <form
            onSubmit={(event) =>
              validate_login(
                event,
                normalizePhone(loginPhone),
                loginPassword,
                setIsSubmitting,
                loginPhoneDigits,
                setLoginPhoneHint,
                callbackUrl
              )
            }
            className="flex flex-col gap-4"
          >
            <VkAuthBlock label="Войти через VK ID" />

            {vkAuthEnabled ? (
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <div className="h-px flex-1 bg-gray-200" />
                <span>или по номеру телефона и паролю</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
            ) : null}

            <PhoneInput
              label="Телефон"
              value={loginPhone}
              onChange={(nextValue) => {
                setLoginPhone(nextValue)
                setLoginPhoneHint(false)
              }}
              className="w-full"
              paddingY
              noMargin
            />
            {loginPhoneHint && loginPhoneDigits !== 11 && (
              <div className="text-danger text-xs">
                Введите 11 цифр телефона.
              </div>
            )}

            <Input
              label="Пароль"
              type="password"
              value={loginPassword}
              onChange={setLoginPassword}
              autoComplete="current-password"
              fullWidth
              noMargin
            />

            <button
              className="bg-general mt-2 w-full cursor-pointer rounded-lg border border-[#6f582f] px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-[#6f582f] hover:shadow-lg disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-300 disabled:shadow-none"
              type="submit"
              disabled={!loginPhone || !loginPassword || isSubmitting}
            >
              {isSubmitting ? 'Вход...' : 'Войти'}
            </button>
          </form>
        ) : mode === 'reset' ? (
          <form onSubmit={submitReset} className="flex flex-col gap-4">
            <PhoneInput
              label="Телефон"
              value={resetPhone}
              onChange={(nextValue) => {
                setResetPhone(nextValue)
                setResetPhoneHint(false)
                setResetVerify(createVerifyState())
              }}
              className="w-full"
              paddingY
              noMargin
            />
            {resetPhoneHint && resetPhoneDigits !== 11 && (
              <div className="text-danger text-xs">
                Введите 11 цифр телефона.
              </div>
            )}

            <VerificationBlock
              flow="recovery"
              phone={resetPhoneNormalized}
              verifyState={resetVerify}
              setVerifyState={setResetVerify}
            />

            {resetVerify.verified && (
              <Input
                label="Новый пароль"
                type="password"
                value={resetPassword}
                onChange={setResetPassword}
                autoComplete="new-password"
                fullWidth
                noMargin
              />
            )}

            {(resetVerify.verified || !resetVerify.callId) && (
              <button
                type="submit"
                className="ui-btn ui-btn-primary mt-2 w-full cursor-pointer rounded-lg"
                disabled={
                  !resetPhone ||
                  isResetLoading ||
                  resetVerify.loadingStart ||
                  (resetVerify.verified && !resetPassword)
                }
              >
                {!resetVerify.verified
                  ? resetVerify.loadingStart
                    ? 'Запрос...'
                    : 'Подтвердить номер'
                  : isResetLoading
                    ? 'Сохранение...'
                    : 'Сбросить пароль'}
              </button>
            )}
          </form>
        ) : (
          <form onSubmit={submitRegister} className="flex flex-col gap-4">
            <RegistrationLegalConsents
              termsAccepted={registerTermsAccepted}
              onTermsAcceptedChange={setRegisterTermsAccepted}
              privacyAccepted={registerPrivacyAccepted}
              onPrivacyAcceptedChange={setRegisterPrivacyAccepted}
              personalDataAccepted={registerPersonalDataAccepted}
              onPersonalDataAcceptedChange={setRegisterPersonalDataAccepted}
            />

            <VkAuthBlock label="Зарегистрироваться через VK ID" />

            {vkAuthEnabled ? (
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <div className="h-px flex-1 bg-gray-200" />
                <span>или по номеру телефона</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
            ) : null}

            <PhoneInput
              label="Телефон"
              value={registerPhone}
              onChange={(nextValue) => {
                setRegisterPhone(nextValue)
                setRegisterPhoneHint(false)
                setRegisterVerify(createVerifyState())
              }}
              className="w-full"
              paddingY
              noMargin
            />
            {registerPhoneHint && registerPhoneDigits !== 11 && (
              <div className="text-danger text-xs">
                Введите 11 цифр телефона.
              </div>
            )}

            <VerificationBlock
              flow="register"
              phone={registerPhoneNormalized}
              verifyState={registerVerify}
              setVerifyState={setRegisterVerify}
            />

            {registerVerify.verified && (
              <>
                <Input
                  label="Пароль"
                  type="password"
                  value={registerPassword}
                  onChange={setRegisterPassword}
                  autoComplete="new-password"
                  fullWidth
                  noMargin
                />

                <Input
                  label="Повторите пароль"
                  type="password"
                  value={registerPasswordRepeat}
                  onChange={setRegisterPasswordRepeat}
                  autoComplete="new-password"
                  fullWidth
                  noMargin
                />
              </>
            )}

            {(registerVerify.verified || !registerVerify.callId) && (
              <button
                type="submit"
                className="ui-btn ui-btn-primary mt-2 w-full cursor-pointer rounded-lg"
                disabled={
                  !registerPhone ||
                  isRegisterLoading ||
                  registerVerify.loadingStart ||
                  (registerVerify.verified &&
                    (!registerPassword ||
                      !registerPasswordRepeat ||
                      !registerTermsAccepted ||
                      !registerPrivacyAccepted ||
                      !registerPersonalDataAccepted))
                }
              >
                {!registerVerify.verified
                  ? registerVerify.loadingStart
                    ? 'Запрос...'
                    : 'Подтвердить номер'
                  : isRegisterLoading
                    ? 'Создание...'
                    : 'Создать аккаунт'}
              </button>
            )}
          </form>
        )}

        {mode === 'login' ? (
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              className="text-general w-full cursor-pointer text-center text-sm font-medium transition hover:text-[#6f582f]"
              onClick={() => setMode('reset')}
            >
              Забыли пароль?
            </button>
            <button
              type="button"
              className="text-general w-full cursor-pointer text-center text-sm font-medium transition hover:text-[#6f582f]"
              onClick={() => {
                reachGoal('registration_page_open', { entry: 'login' })
                setMode('register')
              }}
            >
              Создать аккаунт
            </button>
            <Link
              href="/"
              className="text-general w-full cursor-pointer text-center text-sm font-medium transition hover:text-[#6f582f]"
            >
              На главную
            </Link>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              className="text-general w-full cursor-pointer text-center text-sm font-medium transition hover:text-[#6f582f]"
              onClick={() => setMode('login')}
            >
              Вернуться ко входу
            </button>
            <Link
              href="/"
              className="text-general w-full cursor-pointer text-center text-sm font-medium transition hover:text-[#6f582f]"
            >
              На главную
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

export default LoginInputs
