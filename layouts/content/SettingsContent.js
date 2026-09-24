/* eslint-disable react-hooks/exhaustive-deps */
'use client'

import { useEffect, useRef, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { modalsFuncAtom } from '@state/atoms'
import AppButton from '@components/AppButton'
import InputDuration from '@components/InputDuration'
import IconCheckBox from '@components/IconCheckBox'
import ComboBox from '@components/ComboBox'
import MutedText from '@components/MutedText'
import LabeledContainer from '@components/LabeledContainer'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import loggedUserActiveRoleSelector from '@state/selectors/loggedUserActiveRoleSelector'
import { postData } from '@helpers/CRUD'
import {
  resolveServerSyncDisabled,
  writeServerSyncDisabledToStorage,
} from '@helpers/serverSyncMode'
import {
  clearServerSyncQueue,
  getServerSyncQueueCount,
  SERVER_SYNC_FLUSH_NOW_EVENT,
  SERVER_SYNC_QUEUE_CHANGED_EVENT,
} from '@helpers/serverSyncQueue'
import { useSiteSettingsQuery } from '@helpers/useEntityQueries'
import { SHOW_COLLEAGUE_TRANSFER_FIELDS_KEY } from '@helpers/firstRunWizard.mjs'
import { resolveWorkItemTerminology } from '@helpers/workItemTerminology.mjs'

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

const PRIMARY_ENTITY_TERMINOLOGY_OPTIONS = [
  { value: 'auto', name: 'Авто — по сфере работы' },
  { value: 'events', name: 'Мероприятия' },
  { value: 'orders', name: 'Заказы' },
]

const EVENT_FORM_VARIANT_OPTIONS = [
  { value: 'classic', name: 'Классическая' },
  { value: 'compact', name: 'Компактная' },
]

const SettingsContent = () => {
  const modals = useAtomValue(modalsFuncAtom)
  const { data: siteSettings = {} } = useSiteSettingsQuery()
  const [siteSettingsState, setSiteSettings] = useAtom(siteSettingsAtom)
  const [darkTheme, setDarkTheme] = useState(false)
  const [defaultEventDuration, setDefaultEventDuration] = useState(60)
  const [queuedChangesCount, setQueuedChangesCount] = useState(0)
  const durationTimeoutRef = useRef(null)
  const loggedUserActiveRole = useAtomValue(loggedUserActiveRoleSelector)

  // Keep Jotai atom in sync with React Query for backward compatibility
  useEffect(() => {
    if (siteSettings && Object.keys(siteSettings).length > 0) {
      setSiteSettings(siteSettings)
    }
  }, [siteSettings, setSiteSettings])

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme')
    const isDark = storedTheme === 'dark'
    setDarkTheme(isDark)
    document.body.classList.toggle('theme-dark', isDark)
  }, [])

  const customSettings = siteSettingsState?.custom ?? {}
  const workItemTerms = resolveWorkItemTerminology(siteSettingsState)
  const serverSyncDisabled = resolveServerSyncDisabled(siteSettingsState)
  const checkBoxColors = darkTheme
    ? { checked: '#f8fafc', unchecked: '#94a3b8' }
    : { checked: '#111827', unchecked: '#9ca3af' }

  const mergeSiteSettingsPatch = (currentSettings, patch) => {
    const current = currentSettings ?? {}
    const next = { ...current, ...patch }
    if (patch?.custom !== undefined) {
      next.custom = {
        ...(current?.custom ?? {}),
        ...(patch.custom ?? {}),
      }
    }
    return next
  }

  const saveSiteSettingsPatch = async (patch, forceServerSync = false) => {
    const merged = mergeSiteSettingsPatch(siteSettingsState, patch)
    setSiteSettings(merged)

    if (serverSyncDisabled && !forceServerSync) return merged

    await postData(
      '/api/site',
      patch,
      (data) => setSiteSettings(data),
      null,
      false,
      null
    )
    return merged
  }

  useEffect(() => {
    setQueuedChangesCount(getServerSyncQueueCount())
    if (typeof window === 'undefined') return undefined
    const handleQueueChanged = () => {
      setQueuedChangesCount(getServerSyncQueueCount())
    }
    window.addEventListener(SERVER_SYNC_QUEUE_CHANGED_EVENT, handleQueueChanged)
    return () => {
      window.removeEventListener(
        SERVER_SYNC_QUEUE_CHANGED_EVENT,
        handleQueueChanged
      )
    }
  }, [])

  useEffect(() => {
    const value = Number(customSettings?.defaultEventDurationMinutes ?? 60)
    setDefaultEventDuration(Number.isFinite(value) && value > 0 ? value : 60)
  }, [customSettings?.defaultEventDurationMinutes])

  useEffect(() => {
    if (!siteSettingsState?._id) return
    if (!Number.isFinite(defaultEventDuration)) return
    if (defaultEventDuration <= 0) return
    const currentDuration = Number(
      siteSettingsState?.custom?.defaultEventDurationMinutes ?? 60
    )
    if (currentDuration === defaultEventDuration) return
    if (durationTimeoutRef.current) {
      clearTimeout(durationTimeoutRef.current)
    }
    durationTimeoutRef.current = setTimeout(() => {
      saveSiteSettingsPatch({
        custom: {
          defaultEventDurationMinutes: defaultEventDuration,
        },
      })
    }, 400)
    return () => {
      if (durationTimeoutRef.current) {
        clearTimeout(durationTimeoutRef.current)
      }
    }
  }, [defaultEventDuration, siteSettingsState, serverSyncDisabled])

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <IconCheckBox
          label="Темная тема"
          checked={darkTheme}
          onClick={() => {
            const nextValue = !darkTheme
            setDarkTheme(nextValue)
            localStorage.setItem('theme', nextValue ? 'dark' : 'light')
            document.body.classList.toggle('theme-dark', nextValue)
          }}
          checkedIconColor={checkBoxColors.checked}
          uncheckedIconColor={checkBoxColors.unchecked}
          noMargin
        />
        {loggedUserActiveRole?.dev && (
          <LabeledContainer label="Конфиденциальность" noMargin>
            <div className="flex w-full flex-col gap-3">
              <IconCheckBox
                label="Отключить синхронизацию с сервером"
                checked={serverSyncDisabled}
                onClick={async () => {
                  const nextValue = !serverSyncDisabled
                  writeServerSyncDisabledToStorage(nextValue)
                  const patch = {
                    custom: {
                      ...(siteSettingsState?.custom ?? {}),
                      disableServerSync: nextValue,
                    },
                  }
                  if (nextValue) {
                    setSiteSettings(
                      mergeSiteSettingsPatch(siteSettingsState, patch)
                    )
                    return
                  }
                  await saveSiteSettingsPatch(patch, true)
                }}
                checkedIconColor={checkBoxColors.checked}
                uncheckedIconColor={checkBoxColors.unchecked}
                noMargin
              />
              <MutedText className="text-gray-500">
                {serverSyncDisabled
                  ? 'Серверная синхронизация отключена: изменения сохраняются только локально на этом устройстве.'
                  : 'Серверная синхронизация включена: изменения сохраняются в облаке и доступны на других устройствах.'}
              </MutedText>
              {serverSyncDisabled ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <MutedText className="text-gray-500">
                    Локальная очередь запросов: {queuedChangesCount}
                  </MutedText>
                  <button
                    type="button"
                    className="action-icon-button action-icon-button--warning flex h-9 cursor-pointer items-center justify-center rounded px-3 text-xs font-semibold"
                    onClick={() => {
                      clearServerSyncQueue()
                    }}
                  >
                    Очистить очередь
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <MutedText className="text-gray-500">
                    В очереди к синхронизации: {queuedChangesCount}
                  </MutedText>
                  <button
                    type="button"
                    className="action-icon-button action-icon-button--warning flex h-9 cursor-pointer items-center justify-center rounded px-3 text-xs font-semibold"
                    onClick={() => {
                      if (typeof window === 'undefined') return
                      window.dispatchEvent(
                        new CustomEvent(SERVER_SYNC_FLUSH_NOW_EVENT)
                      )
                    }}
                    disabled={queuedChangesCount === 0}
                  >
                    Синхронизировать сейчас
                  </button>
                </div>
              )}
            </div>
          </LabeledContainer>
        )}
        <ComboBox
          label="Как называть основную работу"
          items={PRIMARY_ENTITY_TERMINOLOGY_OPTIONS}
          value={customSettings?.primaryEntityTerminology ?? 'auto'}
          onChange={(value) =>
            saveSiteSettingsPatch({
              custom: {
                ...(siteSettingsState?.custom ?? {}),
                primaryEntityTerminology: value,
              },
            })
          }
          fullWidth
          noMargin
        />
        <MutedText className="text-gray-500">
          Сейча в кабинете: «{workItemTerms.pluralCapitalized}». Авторежим
          использует выбранную в мастере сферу работы.
        </MutedText>
        <ComboBox
          label={`Форма создания и редактирования ${workItemTerms.genitive}`}
          items={EVENT_FORM_VARIANT_OPTIONS}
          value={customSettings?.eventFormVariant === 'classic' ? 'classic' : 'compact'}
          onChange={(value) =>
            saveSiteSettingsPatch({ custom: { eventFormVariant: value } })
          }
          fullWidth
          noMargin
        />
        <ComboBox
          label="Часовой пояс"
          items={TIME_ZONE_OPTIONS}
          value={siteSettingsState?.timeZone ?? 'Asia/Krasnoyarsk'}
          onChange={(value) => saveSiteSettingsPatch({ timeZone: value })}
          fullWidth
          noMargin
        />
        <InputDuration
          label={`Стандартная длительность ${workItemTerms.genitive}`}
          min={15}
          max={1440}
          value={defaultEventDuration}
          onChange={setDefaultEventDuration}
          noMargin
        />
        <LabeledContainer label="Передача заказов коллеге" noMargin>
          <div className="flex flex-col gap-2">
            <IconCheckBox
              checked={
                customSettings?.[SHOW_COLLEAGUE_TRANSFER_FIELDS_KEY] === true
              }
              onClick={() =>
                saveSiteSettingsPatch({
                  custom: {
                    ...(siteSettingsState?.custom ?? {}),
                    [SHOW_COLLEAGUE_TRANSFER_FIELDS_KEY]:
                      customSettings?.[SHOW_COLLEAGUE_TRANSFER_FIELDS_KEY] !==
                      true,
                  },
                })
              }
              label="Иногда передаю заказ коллеге"
              checkedIconColor={checkBoxColors.checked}
              uncheckedIconColor={checkBoxColors.unchecked}
            />
            <MutedText className="text-gray-500">
              Если включено, в редакторе заявки появятся поля «Передано коллеге»
              и выбор коллеги. Если выключено, эти поля скрыты и новые карточки
              ведутся как ваши собственные заказы.
            </MutedText>
          </div>
        </LabeledContainer>
        <LabeledContainer label="Начало работы" noMargin>
          <div className="flex w-full flex-col gap-3">
            <MutedText className="text-gray-500">
              Обновите основные данные или попробуйте работу с заявкой на
              учебном примере.
            </MutedText>
            <div className="flex flex-wrap gap-2">
              <AppButton
                variant="secondary"
                className="min-h-11 cursor-pointer"
                onClick={() => modals.user?.firstRunWizard?.()}
              >
                Открыть мастер настройки
              </AppButton>
              <AppButton
                variant="secondary"
                className="min-h-11 cursor-pointer"
                onClick={() => modals.user?.firstRunTour?.()}
              >
                Первые шаги в Ведело
              </AppButton>
            </div>
          </div>
        </LabeledContainer>
      </div>
    </div>
  )
}

export default SettingsContent
