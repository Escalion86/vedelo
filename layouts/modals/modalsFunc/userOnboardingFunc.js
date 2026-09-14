import { useEffect, useRef, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { useRouter } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSun } from '@fortawesome/free-solid-svg-icons/faSun'
import { faMoon } from '@fortawesome/free-solid-svg-icons/faMoon'
import ComboBox from '@components/ComboBox'
import Input from '@components/Input'
import InputDuration from '@components/InputDuration'
import InputImages from '@components/InputImages'
import PhoneInput from '@components/PhoneInput'
import Textarea from '@components/Textarea'
import Notice from '@components/Notice'
import { FirstRunTourModal } from './firstRunTourFunc'
import { postData } from '@helpers/CRUD'
import { useServicesQuery } from '@helpers/useEntityQueries'
import getPersonFullName from '@helpers/getPersonFullName'
import { buildSingleNamePatch } from '@helpers/personName.mjs'
import {
  ONBOARDING_ACTIVITY_PRESETS,
  areOnboardingServicesValid,
  getStarterServicesForPreset,
} from '@helpers/onboardingPresets.mjs'
import {
  FIRST_RUN_STEPS,
  FIRST_RUN_STEP_KEY,
  FIRST_RUN_TOUR_KEY,
  getFirstRunStepIndex,
  buildFirstRunCompletionCustomPatch,
} from '@helpers/firstRunWizard.mjs'
import { reachGoalOnce } from '@helpers/metrikaGoals'
import { normalizeTelegramInput } from '@helpers/socialInput'
import { getNounServices } from '@helpers/getNoun'
import useOnboardingTown from '@helpers/useOnboardingTown'
import itemsFuncAtom from '@state/atoms/itemsFuncAtom'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'

const TIME_ZONE_OPTIONS = [
  { value: 'UTC', name: 'UTC' },
  { value: 'Europe/Kaliningrad', name: 'UTC+02 Калининград' },
  { value: 'Europe/Moscow', name: 'UTC+03 Москва' },
  { value: 'Europe/Samara', name: 'UTC+04 Самара' },
  { value: 'Asia/Yekaterinburg', name: 'UTC+05 Екатеринбург' },
  { value: 'Asia/Omsk', name: 'UTC+06 Омск' },
  { value: 'Asia/Krasnoyarsk', name: 'UTC+07 Красноярск' },
  { value: 'Asia/Irkutsk', name: 'UTC+08 Иркутск' },
  { value: 'Asia/Yakutsk', name: 'UTC+09 Якутск' },
  { value: 'Asia/Vladivostok', name: 'UTC+10 Владивосток' },
  { value: 'Asia/Magadan', name: 'UTC+11 Магадан' },
  { value: 'Asia/Kamchatka', name: 'UTC+12 Камчатка' },
]

const titles = [
  'Как вас зовут?',
  'Где вы работаете?',
  'Чем вы занимаетесь?',
  'Что у вас заказывают?',
]
const descriptions = [
  'Укажите фамилию и имя, отчество.',
  'Проверьте город и время, чтобы напоминания приходили вовремя.',
  'Предложим подходящую услугу для начала работы.',
  'Достаточно одной услуги. Стоимость и подробности можно уточнить позже.',
]

const detectTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export const FirstRunWizardModal = ({
  closeModal,
  setOnConfirmFunc,
  setDisableConfirm,
  setConfirmButtonName,
  setTitle,
  setCloseButtonShow,
  setOnCloseButtonFunc,
}) => {
  const [user, setUser] = useAtom(loggedUserAtom)
  const [settings, setSettings] = useAtom(siteSettingsAtom)
  const isRepeatRun = useRef(settings?.custom?.firstRunWizardCompleted === true)
  const closeRef = useRef(closeModal)
  closeRef.current = closeModal
  const {
    data: services = [],
    isFetching: servicesLoading,
    isError: servicesLoadFailed,
    refetch: refetchServices,
  } = useServicesQuery()
  const items = useAtomValue(itemsFuncAtom)
  const router = useRouter()
  const [stepIndex, setStepIndex] = useState(() =>
    getFirstRunStepIndex(settings?.custom)
  )
  const [phase, setPhase] = useState('setup')
  const [fullName, setFullName] = useState(() => getPersonFullName(user))
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp ?? '')
  const [telegram, setTelegram] = useState(user?.telegram ?? '')
  const [images, setImages] = useState(user?.images ?? [])
  const [theme, setTheme] = useState(null)

  useEffect(() => {
    setTheme(document.body.classList.contains('theme-dark') ? 'dark' : 'light')
  }, [])

  const changeTheme = (value) => {
    setTheme(value)
    document.body.classList.toggle('theme-dark', value === 'dark')
    try {
      window.localStorage.setItem('theme', value)
    } catch {
      // The selected theme still applies for this session when storage is unavailable.
    }
  }
  const { town, changeTown, isDetected } = useOnboardingTown(
    settings?.defaultTown ?? '',
    !user?.impersonation?.active
  )
  const [timeZone, setTimeZone] = useState(() =>
    settings?.custom?.timeZoneConfirmed ? settings.timeZone : detectTimeZone()
  )
  const timeZoneOptions = TIME_ZONE_OPTIONS.some(
    (item) => item.value === timeZone
  )
    ? TIME_ZONE_OPTIONS
    : [...TIME_ZONE_OPTIONS, { value: timeZone, name: timeZone }]
  const [preset, setPreset] = useState(
    settings?.custom?.onboardingActivityPreset || 'events'
  )
  const [drafts, setDrafts] = useState(null)
  const [busy, setBusy] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  useEffect(() => {
    setCloseButtonShow?.(isRepeatRun.current)
    if (isRepeatRun.current) {
      setOnCloseButtonFunc?.(() => {
        if (!lock.current) closeRef.current()
      })
    }
  }, [setCloseButtonShow, setOnCloseButtonFunc])
  const confirmRef = useRef(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const step = FIRST_RUN_STEPS[stepIndex]

  useEffect(() => {
    if (
      step !== 'services' ||
      drafts !== null ||
      servicesLoading ||
      servicesLoadFailed
    )
      return
    setDrafts(
      (services.length > 0
        ? []
        : getStarterServicesForPreset(preset).slice(0, 1)
      ).map((service) => ({
        ...service,
        draftKey: crypto.randomUUID(),
      }))
    )
  }, [step, drafts, services, preset, servicesLoading, servicesLoadFailed])

  const hasExistingServices = services.length > 0

  const saveSettings = async (patch) => {
    const next = await postData('/api/site', patch)
    if (!next)
      throw new Error(
        'Не удалось сохранить настройку. Проверьте соединение и повторите.'
      )
    settingsRef.current = next
    setSettings(next)
    return next
  }
  const saveCustom = (patch) =>
    saveSettings({ custom: { ...settingsRef.current?.custom, ...patch } })
  const leave = async () => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    try {
      await saveCustom({ [FIRST_RUN_TOUR_KEY]: 'skipped' })
      closeModal()
      router.push('/cabinet/attention')
    } catch (error) {
      setError(error.message)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  const valid =
    step === 'profile'
      ? Boolean(fullName.trim())
      : step === 'environment'
        ? Boolean(town.trim() && timeZone)
        : step === 'specialization'
          ? ONBOARDING_ACTIVITY_PRESETS.some((item) => item.key === preset)
          : hasExistingServices || areOnboardingServicesValid(drafts)

  const saveStep = async () => {
    if (lock.current) return
    setAttempted(true)
    setError('')
    if (!valid) return
    lock.current = true
    setBusy(true)
    try {
      if (step === 'profile') {
        const saved = await items?.user?.set({
          _id: user._id,
          ...buildSingleNamePatch(fullName),
          phone: String(phone || '').replace(/[^\d]/g, ''),
          whatsapp: String(whatsapp || '').replace(/[^\d]/g, '') || null,
          telegram: normalizeTelegramInput(telegram),
          images,
        })
        if (!saved?._id)
          throw new Error('Не удалось сохранить профиль. Повторите попытку.')
        setUser(saved)
      }
      if (step === 'environment') {
        const city = town.trim()
        await saveSettings({
          defaultTown: city,
          timeZone,
          towns: [...new Set([...(settingsRef.current?.towns ?? []), city])],
          custom: { ...settingsRef.current?.custom, timeZoneConfirmed: true },
        })
      }
      if (step === 'specialization')
        await saveCustom({ onboardingActivityPreset: preset })
      if (step === 'services') {
        for (const draft of drafts ?? []) {
          const saved = await items?.service?.set(
            {
              _id: draft._id,
              title: draft.title.trim(),
              description: draft.description ?? '',
              price: Number(draft.price),
              duration: Number(draft.duration),
              images: draft.images ?? [],
              groupId: draft.groupId ?? null,
            },
            false,
            true
          )
          if (!saved?._id)
            throw new Error('Не удалось сохранить услугу. Повторите попытку.')
          // Preserve IDs immediately, including retries after a partial save.
          setDrafts((prev) =>
            prev.map((item) =>
              item.draftKey === draft.draftKey
                ? { ...saved, draftKey: item.draftKey }
                : item
            )
          )
        }
        await saveSettings({
          custom: {
            ...buildFirstRunCompletionCustomPatch({
              existing: settingsRef.current?.custom,
            }),
            [FIRST_RUN_STEP_KEY]: null,
            onboardingStarterServicesCreated:
              settingsRef.current?.custom?.onboardingStarterServicesCreated ===
                true || !hasExistingServices,
          },
        })
        fetch('/api/acquisition/activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'onboarding_complete' }),
          keepalive: true,
        }).catch(() => null)
        reachGoalOnce('onboarding_complete')
        setPhase('choice')
      } else {
        await saveCustom({
          [FIRST_RUN_STEP_KEY]: FIRST_RUN_STEPS[stepIndex + 1],
        })
        setStepIndex((value) => value + 1)
      }
      setAttempted(false)
    } catch (error) {
      setError(error.message || 'Не удалось сохранить шаг. Повторите попытку.')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  confirmRef.current =
    phase === 'setup'
      ? saveStep
      : () => {
          setError('')
          setPhase('tour')
        }

  useEffect(() => {
    setOnConfirmFunc(
      phase === 'tour' ? undefined : () => confirmRef.current?.()
    )
  }, [phase, setOnConfirmFunc])
  useEffect(() => {
    setTitle(
      phase === 'setup'
        ? titles[stepIndex]
        : phase === 'choice'
          ? 'Всё готово к работе'
          : 'Знакомство с CRM'
    )
    setConfirmButtonName(
      phase === 'choice'
        ? 'Показать на примере'
        : stepIndex === 3
          ? hasExistingServices
            ? 'Пропустить и завершить'
            : 'Сохранить и продолжить'
          : 'Далее'
    )
    setDisableConfirm(
      busy || (phase === 'setup' && step === 'services' && drafts === null)
    )
  }, [
    phase,
    stepIndex,
    step,
    drafts,
    busy,
    hasExistingServices,
    setTitle,
    setConfirmButtonName,
    setDisableConfirm,
  ])

  const updateDraft = (key, field, value) =>
    setDrafts((prev) =>
      prev.map((item) =>
        item.draftKey === key ? { ...item, [field]: value } : item
      )
    )
  if (phase === 'tour') return <FirstRunTourModal closeModal={closeModal} />
  if (phase === 'choice')
    return (
      <div className="first-run flex flex-col gap-4">
        <p>
          Посмотрите на одной заявке, как не забыть о клиенте и вовремя получить
          задаток.
        </p>
        <p className="first-run-muted text-sm">
          Знакомство можно пропустить и открыть позже в настройках.
        </p>
        <button
          className="first-run-link self-start"
          type="button"
          disabled={busy}
          onClick={leave}
        >
          Перейти в кабинет
        </button>
        {error && (
          <Notice tone="error" role="alert">
            {error}{' '}
            <button
              className="cursor-pointer underline"
              type="button"
              onClick={() => {
                closeModal()
                router.push('/cabinet/attention')
              }}
            >
              Перейти без сохранения результата знакомства
            </button>
          </Notice>
        )}
      </div>
    )
  return (
    <div className="first-run flex min-w-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="first-run-muted">
          Настройка · {stepIndex + 1} из 4
        </span>
        {stepIndex > 0 && (
          <button
            type="button"
            className="first-run-link"
            disabled={busy}
            onClick={() => {
              setStepIndex((value) => value - 1)
              setAttempted(false)
              setError('')
            }}
          >
            Назад
          </button>
        )}
      </div>
      <p className="text-sm">{descriptions[stepIndex]}</p>
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
        {step === 'profile' && (
          <>
            <Input
              label="ФИО"
              value={fullName}
              onChange={setFullName}
              required
              fullWidth
              noMargin
              autoComplete="name"
              error={attempted && !fullName.trim() ? 'Укажите ФИО' : null}
              showErrorText
            />
            <details>
              <summary className="first-run-link">Добавить подробности</summary>
              <div className="mt-3 flex flex-col gap-3">
                <InputImages
                  label="Фото профиля"
                  directory="users"
                  images={images}
                  onChange={setImages}
                  maxImages={1}
                  fullWidth
                />
                <PhoneInput
                  label="Телефон"
                  value={phone}
                  onChange={setPhone}
                  noMargin
                />
                <PhoneInput
                  label="WhatsApp"
                  value={whatsapp}
                  onChange={setWhatsapp}
                  noMargin
                />
                <Input
                  label="Telegram"
                  prefix="@"
                  value={telegram}
                  onChange={(value) =>
                    setTelegram(normalizeTelegramInput(value))
                  }
                  noMargin
                />
              </div>
            </details>
          </>
        )}
        {step === 'environment' && (
          <>
            <div role="group" aria-label="Тема оформления">
              <p className="mb-2 text-sm font-semibold">Тема оформления</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'light', label: 'Светлая', icon: faSun },
                  { value: 'dark', label: 'Тёмная', icon: faMoon },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className="first-run-option first-run-theme-option"
                    aria-pressed={theme === item.value}
                    onClick={() => changeTheme(item.value)}
                  >
                    <FontAwesomeIcon
                      icon={item.icon}
                      className="h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <Input
              label="Основной город"
              className="max-w-72"
              value={town}
              onChange={changeTown}
              required
              fullWidth
              noMargin
              error={attempted && !town.trim() ? 'Укажите город' : null}
              showErrorText
            />
            {isDetected && (
              <p className="first-run-muted text-sm">
                Город определён автоматически. Исправьте, если он указан
                неточно.
              </p>
            )}
            <ComboBox
              label="Часовой пояс"
              className="max-w-72"
              items={timeZoneOptions}
              value={timeZone}
              onChange={setTimeZone}
              required
              fullWidth
              noMargin
              error={attempted && !timeZone ? 'Выберите часовой пояс' : null}
            />
          </>
        )}
        {step === 'specialization' && (
          <div className="tablet:grid-cols-2 grid grid-cols-1 gap-2">
            {ONBOARDING_ACTIVITY_PRESETS.map((item) => (
              <button
                type="button"
                key={item.key}
                aria-pressed={preset === item.key}
                className="first-run-option"
                onClick={() => {
                  if (
                    preset !== item.key &&
                    !drafts?.some((draft) => draft._id)
                  )
                    setDrafts(null)
                  setPreset(item.key)
                }}
              >
                {item.title}
              </button>
            ))}
          </div>
        )}
        {step === 'services' && (
          <>
            {drafts === null && (
              <p role="status">
                {servicesLoadFailed
                  ? 'Не удалось загрузить услуги.'
                  : 'Загружаем услуги…'}
              </p>
            )}
            {servicesLoadFailed && (
              <button
                type="button"
                className="first-run-link"
                onClick={() => refetchServices()}
              >
                Повторить загрузку
              </button>
            )}
            {hasExistingServices && drafts !== null && (
              <Notice tone="info">
                У вас уже есть {getNounServices(services.length)}. Создавать
                новую не требуется — пропустите этот шаг и завершите настройку.
              </Notice>
            )}
            {drafts?.map((draft, index) => (
              <section
                className="first-run-card flex flex-col gap-3"
                key={draft.draftKey}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">
                    Услуга {index + 1}
                  </span>
                  {!draft._id && drafts.length > 1 && (
                    <button
                      type="button"
                      className="first-run-link"
                      onClick={() =>
                        setDrafts((prev) =>
                          prev.filter(
                            (item) => item.draftKey !== draft.draftKey
                          )
                        )
                      }
                    >
                      Убрать
                    </button>
                  )}
                </div>
                <Input
                  label="Название услуги"
                  value={draft.title}
                  onChange={(value) =>
                    updateDraft(draft.draftKey, 'title', value)
                  }
                  required
                  fullWidth
                  noMargin
                  showErrorText
                  error={
                    attempted && !String(draft.title ?? '').trim()
                      ? 'Укажите название услуги'
                      : null
                  }
                />
                <details>
                  <summary className="first-run-link">
                    Цена и подробности
                  </summary>
                  <div className="mt-3 flex flex-col gap-3">
                    <Input
                      label="Цена"
                      value={draft.price}
                      onChange={(value) =>
                        updateDraft(draft.draftKey, 'price', value)
                      }
                      type="number"
                      min={0}
                      postfix="₽"
                      className="w-fit max-w-full"
                      noMargin
                    />
                    <InputDuration
                      label="Продолжительность"
                      value={draft.duration}
                      onChange={(value) =>
                        updateDraft(draft.draftKey, 'duration', value)
                      }
                      min={0}
                      noMargin
                    />
                    <Textarea
                      label="Описание"
                      value={draft.description ?? ''}
                      onChange={(value) =>
                        updateDraft(draft.draftKey, 'description', value)
                      }
                      rows={2}
                      noMargin
                    />
                  </div>
                </details>
              </section>
            ))}
            {drafts !== null && !hasExistingServices && (
              <button
                type="button"
                className="first-run-link self-start"
                onClick={() =>
                  setDrafts((prev) => [
                    ...prev,
                    {
                      draftKey: crypto.randomUUID(),
                      title: '',
                      description: '',
                      price: 0,
                      duration: 0,
                    },
                  ])
                }
              >
                Добавить ещё услугу
              </button>
            )}
            {attempted && !valid && (
              <Notice tone="warning">
                Укажите название каждой услуги. Цена и продолжительность должны
                быть неотрицательными числами.
              </Notice>
            )}
          </>
        )}
      </fieldset>
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
    </div>
  )
}

export default function userOnboardingFunc() {
  return {
    title: 'Первичная настройка',
    closeButtonShow: false,
    closeButtonName: 'Вернуться в кабинет',
    declineButtonShow: false,
    crossShow: false,
    Children: FirstRunWizardModal,
  }
}
