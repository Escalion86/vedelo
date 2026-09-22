'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useAtom, useAtomValue } from 'jotai'
import {
  faChevronDown,
  faCheckCircle,
  faBookOpen,
  faCopy,
  faPencilAlt,
  faTriangleExclamation,
  faSpinner,
  faTrash,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Input from '@components/Input'
import Select from '@components/Select'
import IconCheckBox from '@components/IconCheckBox'
import IconActionButton from '@components/IconActionButton'
import Notice from '@components/Notice'
import GoogleCalendarSettings from '@components/GoogleCalendarSettings'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import tariffsAtom from '@state/atoms/tariffsAtom'
import { modalsFuncAtom } from '@state/atoms'
import { postData } from '@helpers/CRUD'
import useSnackbar from '@helpers/useSnackbar'
import { getUserTariffAccess } from '@helpers/tariffAccess'
import { formatMoney } from '@helpers/formatMoney'
import ReactMarkdown from 'react-markdown'

const getCustomValue = (custom, key) => {
  if (!custom) return undefined
  if (typeof custom.get === 'function') return custom.get(key)
  return custom[key]
}

const generateApiKey = () => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `lead_${crypto.randomUUID().replace(/-/g, '')}`
  }
  return `lead_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

const generateApiKeyId = () => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }
  return `key_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

const generateNovofonSecret = () => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `novofon_${crypto.randomUUID().replace(/-/g, '')}`
  }
  return `novofon_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

const generateAvitoSecret = () => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `avito_${crypto.randomUUID().replace(/-/g, '')}`
  }
  return `avito_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

const generateVkSecret = () => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `vk_${crypto.randomUUID().replace(/-/g, '')}`
  }
  return `vk_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

const generateVkCallbackSecret = () => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `vksec_${crypto.randomUUID().replace(/-/g, '')}`
  }
  return `vksec_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

const normalizePublicLeadApiKeys = (customSettings) => {
  const list = getCustomValue(customSettings, 'publicLeadApiKeys')
  const keys = Array.isArray(list)
    ? list
        .map((item) => ({
          id: String(item?.id || generateApiKeyId()),
          name: String(item?.name || '').trim() || 'Источник API',
          key: String(item?.key || '').trim(),
          enabled: item?.enabled !== false,
        }))
        .filter((item) => item.key)
    : []

  const legacyKey = String(
    getCustomValue(customSettings, 'publicLeadApiKey') || ''
  ).trim()
  if (legacyKey && !keys.some((item) => item.key === legacyKey)) {
    keys.unshift({
      id: 'legacy',
      name: 'Основной API',
      key: legacyKey,
      enabled: true,
    })
  }

  return keys
}

const IntegrationsApiGuide = () => {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch('/api/public/docs/public-leads-api')
        if (!response.ok) throw new Error(String(response.status))
        const text = await response.text()
        if (!active) return
        setContent(text)
      } catch (loadError) {
        if (!active) return
        setError('Не удалось загрузить инструкцию API')
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [])

  if (loading) return <div className="text-sm text-gray-600">Загрузка...</div>
  if (error) return <div className="text-sm text-red-600">{error}</div>

  return (
    <div className="h-full overflow-y-auto text-sm leading-6 text-gray-800">
      <ReactMarkdown
        components={{
          h1: ({ ...props }) => (
            <h1
              className="mb-3 text-xl font-semibold text-gray-900"
              {...props}
            />
          ),
          h2: ({ ...props }) => (
            <h2
              className="mt-4 mb-2 text-lg font-semibold text-gray-900"
              {...props}
            />
          ),
          h3: ({ ...props }) => (
            <h3
              className="mt-3 mb-2 text-base font-semibold text-gray-900"
              {...props}
            />
          ),
          p: ({ ...props }) => <p className="mb-2" {...props} />,
          ul: ({ ...props }) => (
            <ul className="mb-2 list-disc pl-5" {...props} />
          ),
          ol: ({ ...props }) => (
            <ol className="mb-2 list-decimal pl-5" {...props} />
          ),
          li: ({ ...props }) => <li className="mb-1" {...props} />,
          code: ({ className, children, ...props }) =>
            className ? (
              <code
                className={`block overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-100 ${className}`}
                {...props}
              >
                {children}
              </code>
            ) : (
              <code
                className="rounded bg-gray-100 px-1 py-0.5 text-xs text-gray-900"
                {...props}
              >
                {children}
              </code>
            ),
          pre: ({ ...props }) => <pre className="mb-3" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

const ApiKeyEditorModal = ({
  closeModal,
  setOnConfirmFunc,
  setConfirmButtonName,
  setDisableConfirm,
  initialApiKey,
  onSave,
}) => {
  const snackbar = useSnackbar()
  const [name, setName] = useState(initialApiKey?.name ?? '')
  const [key, setKey] = useState(initialApiKey?.key ?? generateApiKey())
  const [enabled, setEnabled] = useState(initialApiKey?.enabled !== false)
  const trimmedName = name.trim()

  useEffect(() => {
    setConfirmButtonName(initialApiKey?.id ? 'Сохранить' : 'Создать ключ')
  }, [initialApiKey?.id, setConfirmButtonName])

  useEffect(() => {
    setDisableConfirm(!trimmedName || !key)
  }, [key, setDisableConfirm, trimmedName])

  useEffect(() => {
    setOnConfirmFunc(async () => {
      if (!trimmedName || !key) return
      await onSave({
        id: initialApiKey?.id || generateApiKeyId(),
        name: trimmedName,
        key,
        enabled,
      })
      closeModal()
    })
  }, [
    closeModal,
    enabled,
    initialApiKey?.id,
    key,
    onSave,
    setOnConfirmFunc,
    trimmedName,
  ])

  return (
    <div className="flex flex-col gap-3">
      <Input
        label="Название источника"
        value={name}
        onChange={setName}
        noMargin
        fullWidth
      />
      <div className="flex items-start gap-2">
        <Input
          label="API key"
          value={key}
          onChange={() => {}}
          disabled
          noMargin
          fullWidth
        />
        <IconActionButton
          icon={faCopy}
          size="md"
          variant="success"
          title="Скопировать ключ"
          className="shrink-0"
          onClick={async () => {
            if (!key || !navigator?.clipboard) {
              snackbar.warning('Не удалось скопировать ключ')
              return
            }
            try {
              await navigator.clipboard.writeText(key)
              snackbar.success('Ключ скопирован')
            } catch (error) {
              snackbar.error('Не удалось скопировать ключ')
            }
          }}
        />
      </div>
      <IconCheckBox
        label="Ключ активен"
        checked={enabled}
        onClick={() => setEnabled((value) => !value)}
        noMargin
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="action-icon-button action-icon-button--warning tablet:w-auto flex h-10 w-full cursor-pointer items-center justify-center rounded px-3 text-sm font-semibold"
          onClick={() => setKey(generateApiKey())}
        >
          Перегенерировать
        </button>
      </div>
    </div>
  )
}

const NovofonGuideImage = ({ src, alt, width, height }) => (
  <Image
    src={src}
    alt={alt}
    width={width}
    height={height}
    loading="lazy"
    className="h-auto w-full rounded-lg border border-gray-200 shadow-sm"
  />
)

const NovofonGuide = () => (
  <div className="flex flex-col gap-3 text-sm leading-6 text-gray-700">
    <p>
      Эта интеграция принимает HTTP-уведомления Novofon о звонках. После
      завершения разговора звонок появится в разделе Звонки, где можно сохранить
      заметку, распознать запись и подготовить черновик заявки.
    </p>
    <ol className="list-decimal space-y-2 pl-5">
      <li>
        В Ведело включите интеграцию Novofon. Если секретный ключ еще не
        создан, он появится автоматически.
      </li>
      <li>
        Скопируйте поле Адрес для уведомлений Novofon. В адрес уже добавлены ваш
        tenantId и секрет, отдельно их вводить в Novofon не нужно.
      </li>
      <li>
        В личном кабинете Novofon откройте <b>Интеграции → HTTP-уведомления</b>.
        <NovofonGuideImage
          src="/integrations/novofon/01-open-http-notifications.png"
          alt="В личном кабинете Novofon выбран раздел Интеграции и пункт HTTP-уведомления"
          width={475}
          height={375}
        />
      </li>
      <li>
        Нажмите <b>Добавить HTTP-уведомление</b>.
        <NovofonGuideImage
          src="/integrations/novofon/02-add-http-notification.png"
          alt="Кнопка Добавить HTTP-уведомление в Novofon"
          width={997}
          height={252}
        />
      </li>
      <li>
        Включите уведомление, задайте понятное название, например «Запись для
        Ведело», и выберите тип события <b>Записанный разговор</b>. Это
        обязательное уведомление: по нему Ведело получает ссылку на запись.
        <NovofonGuideImage
          src="/integrations/novofon/03-select-recorded-call.png"
          alt="Основные параметры HTTP-уведомления: включено уведомление и выбран тип Записанный разговор"
          width={626}
          height={370}
        />
      </li>
      <li>
        В блоке <b>Настройка HTTP</b> выберите <b>POST</b> и вставьте
        скопированный из Ведело адрес в поле URL. Не меняйте автоматически
        предложенное Novofon тело запроса: в нём передаются данные звонка и
        ссылка на запись.
        <NovofonGuideImage
          src="/integrations/novofon/04-set-post-and-url.png"
          alt="В настройке HTTP в Novofon выбран метод POST и указан URL Ведело"
          width={387}
          height={180}
        />
      </li>
      <li>
        Сохраните уведомление. Для журнала всех звонков рекомендуем создать
        второе HTTP-уведомление с типом <b>Завершение разговора</b>: используйте
        тот же метод POST, адрес и стандартное тело запроса. Если нужны только
        записи разговоров, это уведомление можно не добавлять.
      </li>
      <li>
        Переключатель Использовать ключи API в Novofon для приема уведомлений
        обычно не нужен. Поле Ключ Novofon в Ведело можно оставить пустым:
        текущий прием звонков защищен секретом в webhook-адресе.
      </li>
      <li>Сделайте тестовый звонок и дождитесь появления записи.</li>
    </ol>
    <p>
      Если звонок появился в CRM, подключение работает. Запись разговора
      появится только если в Novofon включена запись звонков и сервис передал
      событие NOTIFY_RECORD со ссылкой на файл.
    </p>
    <p>
      Официальная инструкция Novofon:{' '}
      <a
        href="https://novofon.com/instructions/integration/own-crm/"
        target="_blank"
        rel="noreferrer"
        className="text-blue-700 underline"
      >
        Интеграция собственной CRM и телефонии Novofon
      </a>
    </p>
  </div>
)

const AIProviderGuide = () => (
  <div className="flex flex-col gap-3 text-sm leading-6 text-gray-700">
    <p>
      Можно использовать общий ИИ Ведело с оплатой из баланса или подключить
      собственный ключ AITunnel. Собственный ключ сохраняется отдельно для
      вашего аккаунта, а Ведело не списывает деньги за такие запросы.
    </p>
    <ol className="list-decimal space-y-2 pl-5">
      <li>Для простого старта выберите «ИИ Ведело» — ключ не нужен.</li>
      <li>
        Запросы будут списываться из текущего баланса по фактической стоимости.
      </li>
      <li>
        Либо зарегистрируйтесь в AITunnel и вставьте собственный API-ключ.
      </li>
      <li>Включите ИИ-интеграцию.</li>
    </ol>
    <p>
      DeepSeek пока доступен только разработчику: он обрабатывает готовый текст,
      но не распознаёт аудиофайлы.
    </p>
  </div>
)

const AvitoGuide = () => (
  <div className="flex flex-col gap-3 text-sm leading-6 text-gray-700">
    <p>
      Интеграция Avito подключается отдельно для каждого пользователя Ведело.
      Нужны доступ к Avito API и возможность работать с Messenger API или
      webhook сообщений.
    </p>
    <ol className="list-decimal space-y-2 pl-5">
      <li>Войдите в профессиональный аккаунт Avito.</li>
      <li>
        Откройте настройки API: обычно это Профиль, затем Настройки, затем Для
        профессионалов, затем API или раздел Интеграции и API.
      </li>
      <li>
        Создайте приложение или ключ для собственной CRM и скопируйте Client ID
        и Client Secret.
      </li>
      <li>
        Проверьте, что для приложения доступен Messenger API: чаты, сообщения и
        webhook новых сообщений.
      </li>
      <li>
        Вставьте Client ID и Client Secret в Ведело и нажмите Подключить.
      </li>
      <li>
        Если Ведело покажет, что webhook нужно подключить вручную, скопируйте
        Адрес webhook и вставьте его в настройках Avito API.
      </li>
      <li>
        Напишите тестовое сообщение по своему объявлению с другого аккаунта.
      </li>
    </ol>
    <p>
      Если сообщение пришло, Ведело создаст заявку со статусом Черновик и
      источником Avito. Повторные сообщения из того же чата не должны создавать
      дубли.
    </p>
  </div>
)

const VkGuide = () => (
  <div className="flex flex-col gap-3 text-sm leading-6 text-gray-700">
    <p>
      Интеграция VK подключается отдельно для каждого пользователя Ведело.
      Нужен токен сообщества с доступом к сообщениям и Callback API группы.
    </p>
    <ol className="list-decimal space-y-2 pl-5">
      <li>Откройте управление нужной группой VK.</li>
      <li>В разделе Сообщения включите сообщения сообщества.</li>
      <li>
        В разделе Работа с API создайте ключ доступа сообщества с правами на
        сообщения.
      </li>
      <li>Заполните поля в Ведело и нажмите Подключить.</li>
      <li>
        В Callback API добавьте сервер, вставьте адрес webhook из Ведело,
        secret key и подтвердите сервер строкой подтверждения.
      </li>
      <li>В типах событий Callback API включите входящие сообщения.</li>
      <li>Напишите тестовое сообщение в группу с другого аккаунта.</li>
    </ol>
    <p>
      Первое сообщение из нового диалога создаст заявку со статусом Черновик и
      источником VK. Дальнейшие сообщения сохранятся в переписку этой заявки.
    </p>
  </div>
)

const TelegramBusinessGuide = () => (
  <div className="flex flex-col gap-3 text-sm leading-6 text-gray-700">
    <p>
      Для интеграции нужен отдельный Telegram-бот, подключённый к вашему
      аккаунту как Business Bot. Токен хранится только на сервере Ведело.
    </p>
    <div className="font-semibold text-gray-900">1. Создайте бота</div>
    <ol className="list-decimal space-y-2 pl-5">
      <li>
        Откройте{' '}
        <a
          href="https://t.me/BotFather"
          target="_blank"
          rel="noreferrer"
          className="text-blue-700 underline"
        >
          официальный @BotFather
        </a>{' '}
        и нажмите «Запустить».
      </li>
      <li>Отправьте команду /newbot.</li>
      <li>Укажите отображаемое имя бота, например «Ведело секретарь».</li>
      <li>
        Придумайте уникальное имя пользователя, которое заканчивается на{' '}
        <span className="font-semibold">bot</span>, например
        Ведело_Escalion_bot.
      </li>
      <li>
        BotFather пришлёт токен. Скопируйте его, никому не отправляйте и не
        публикуйте.
      </li>
    </ol>
    <div className="font-semibold text-gray-900">
      2. Включите «Режим секретаря»
    </div>
    <ol className="list-decimal space-y-2 pl-5">
      <li>
        В @BotFather отправьте /mybots и выберите созданного бота либо откройте
        его настройки в мини-приложении BotFather.
      </li>
      <li>Откройте раздел Bot Settings / Настройки бота.</li>
      <li>
        Найдите Secretary Mode / Режим секретаря и включите его. В старых
        версиях Telegram этот пункт может называться Business Mode.
      </li>
    </ol>
    <Notice tone="warning" className="rounded">
      Без включённого «Режима секретаря» Telegram не позволит добавить бота к
      вашему аккаунту.
    </Notice>
    <div className="font-semibold text-gray-900">
      3. Подключите бота к Ведело
    </div>
    <ol className="list-decimal space-y-2 pl-5">
      <li>Вставьте полученный токен в блок Telegram Business.</li>
      <li>Нажмите «Подключить» и дождитесь сообщения, что бот настроен.</li>
    </ol>
    <div className="font-semibold text-gray-900">
      4. Добавьте бота в свой Telegram-аккаунт
    </div>
    <ol className="list-decimal space-y-2 pl-5">
      <li>
        В Telegram откройте Настройки → Telegram Business → Чат-боты и добавьте
        созданного бота по его имени пользователя.
      </li>
      <li>
        Разрешите боту читать сообщения и отвечать на них, затем выберите чаты,
        которыми он может управлять.
      </li>
      <li>
        Для личного аккаунта рекомендуется исключить контакты и разрешить боту
        только нужные категории или выбранные чаты.
      </li>
      <li>
        Решите, должна ли Ведело создавать карточку для каждого нового
        Telegram-контакта. Для личного аккаунта не включайте эту настройку.
      </li>
      <li>
        Попросите клиента написать вам тестовое сообщение. После этого диалог
        появится в Ведело. В блоке интеграции статус должен измениться на
        «Подключено к аккаунту».
      </li>
    </ol>
    <p>
      Telegram разрешает Business Bot отвечать в течение 24 часов после
      входящего сообщения. Старая история до подключения автоматически не
      загружается, секретные чаты не поддерживаются.
    </p>
  </div>
)

const IntegrationAccordion = ({
  title,
  description,
  children,
  connected = false,
  warning = false,
  loading = false,
  defaultOpen = false,
}) => {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="shrink-0 overflow-hidden rounded border border-gray-200 bg-white">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
        onClick={() => setOpen((value) => !value)}
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          {description ? (
            <div className="mt-1 text-xs leading-5 text-gray-500">
              {description}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {loading ? (
            <FontAwesomeIcon
              icon={faSpinner}
              className="h-4 w-4 animate-spin text-gray-500"
              title="Проверяем подключение"
            />
          ) : warning ? (
            <FontAwesomeIcon
              icon={faTriangleExclamation}
              className="h-4 w-4 text-amber-500"
              title="Нужно заполнить ключ"
            />
          ) : connected ? (
            <FontAwesomeIcon
              icon={faCheckCircle}
              className="h-4 w-4 text-emerald-600"
              title="Подключено"
            />
          ) : null}
          <FontAwesomeIcon
            icon={faChevronDown}
            className={`h-4 w-4 text-gray-500 transition-transform ${
              open ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>
      {open ? (
        <div className="border-t border-gray-100 px-4 py-4">{children}</div>
      ) : null}
    </section>
  )
}

const InstructionButton = ({ children, onClick }) => (
  <button
    type="button"
    className="action-icon-button action-icon-button--warning tablet:w-auto flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded px-3 text-sm font-semibold"
    onClick={onClick}
  >
    <FontAwesomeIcon icon={faBookOpen} className="h-4 w-4" />
    <span>{children}</span>
  </button>
)

const IntegrationsContent = () => {
  const [siteSettings, setSiteSettings] = useAtom(siteSettingsAtom)
  const loggedUser = useAtomValue(loggedUserAtom)
  const tariffs = useAtomValue(tariffsAtom)
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const snackbar = useSnackbar()
  const [isSaving, setIsSaving] = useState(false)
  const [avitoLoading, setAvitoLoading] = useState(false)
  const [vkLoading, setVkLoading] = useState(false)
  const [telegramLoading, setTelegramLoading] = useState(false)
  const [telegramBotToken, setTelegramBotToken] = useState('')
  const [telegramStatusData, setTelegramStatusData] = useState(null)
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false)
  const [googleCalendarLoading, setGoogleCalendarLoading] = useState(false)
  const [aiUsage, setAiUsage] = useState(null)
  const [aiUsageLoading, setAiUsageLoading] = useState(false)
  const aiAverageCosts = useMemo(() => {
    const quotes = new Map(
      (aiUsage?.quotes || []).map((quote) => [
        quote.feature,
        Number(quote.requiredBalance || 0),
      ])
    )

    return {
      voiceMessage: quotes.get('voice_transcription') || 0,
      phoneCall:
        (quotes.get('call_transcription') || 0) +
        (quotes.get('call_analysis') || 0),
    }
  }, [aiUsage?.quotes])

  const customSettings = useMemo(
    () => siteSettings?.custom ?? {},
    [siteSettings?.custom]
  )
  const apiKeys = useMemo(
    () => normalizePublicLeadApiKeys(customSettings),
    [customSettings]
  )
  const tariffAccess = useMemo(
    () => getUserTariffAccess(loggedUser, tariffs),
    [loggedUser, tariffs]
  )
  const canUseCalendar = Boolean(tariffAccess?.allowCalendarSync)
  const canUseTelephony = Boolean(tariffAccess?.allowTelephony)
  const canUseAi = Boolean(tariffAccess?.allowAi)
  const canUseAvito = Boolean(tariffAccess?.allowAvitoIntegration)
  const canUseVk = Boolean(tariffAccess?.allowVkIntegration)
  const canUseTelegram = Boolean(tariffAccess?.allowTelegramIntegration)
  const canUsePublicLeadApi = Boolean(tariffAccess?.allowPublicLeadApi)
  const isDeveloper = loggedUser?.role === 'dev'
  const isEnabled = getCustomValue(customSettings, 'publicLeadEnabled') === true
  const endpointUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/api/public/lead'
    return `${window.location.origin}/api/public/lead`
  }, [])
  const novofonEnabled =
    getCustomValue(customSettings, 'novofonEnabled') === true
  const novofonApiKey = String(
    getCustomValue(customSettings, 'novofonApiKey') || ''
  )
  const novofonWebhookSecret = String(
    getCustomValue(customSettings, 'novofonWebhookSecret') || ''
  )
  const aitunnelKey = String(
    getCustomValue(customSettings, 'aitunnelKey') || ''
  )
  const deepseekKey = String(
    getCustomValue(customSettings, 'deepseekKey') || ''
  )
  const aiTranscriptionModel = String(
    getCustomValue(customSettings, 'aiTranscriptionModel') || 'whisper-1'
  )
  const aiTranscriptionProvider = String(
    getCustomValue(customSettings, 'aiTranscriptionProvider') || ''
  )
  const savedAiAnalysisProvider = String(
    getCustomValue(customSettings, 'aiAnalysisProvider') || ''
  )
  const aiAnalysisProvider =
    savedAiAnalysisProvider === 'deepseek' && !isDeveloper
      ? aitunnelKey
        ? 'aitunnel'
        : 'artistcrm'
      : savedAiAnalysisProvider ||
        (isDeveloper && deepseekKey
          ? 'deepseek'
          : aitunnelKey
            ? 'aitunnel'
            : 'artistcrm')
  const aiAnalysisModel = String(
    getCustomValue(customSettings, 'aiAnalysisModel') ||
      (aiAnalysisProvider === 'deepseek' ? 'deepseek-v4-flash' : 'gpt-4o-mini')
  )
  const aitunnelEnabled =
    getCustomValue(customSettings, 'aitunnelEnabled') === true ||
    aiTranscriptionProvider === 'aitunnel'
  const savedAiIntegrationEnabled = getCustomValue(
    customSettings,
    'aiIntegrationEnabled'
  )
  const aiIntegrationEnabled =
    typeof savedAiIntegrationEnabled === 'boolean'
      ? savedAiIntegrationEnabled
      : aiAnalysisProvider === 'artistcrm'
        ? true
        : aiAnalysisProvider === 'aitunnel'
          ? getCustomValue(customSettings, 'aitunnelEnabled') === true
          : Boolean(aiAnalysisProvider)
  const selectedAiKey =
    aiAnalysisProvider === 'deepseek' ? deepseekKey : aitunnelKey
  const isAiProviderConfigured =
    aiAnalysisProvider === 'artistcrm'
      ? Boolean(aiUsage?.platformConfigured)
      : Boolean(selectedAiKey)
  const isAiProviderConnected = aiIntegrationEnabled && isAiProviderConfigured
  const avitoEnabled = getCustomValue(customSettings, 'avitoEnabled') === true
  const avitoClientId = String(
    getCustomValue(customSettings, 'avitoClientId') || ''
  )
  const avitoClientSecret = String(
    getCustomValue(customSettings, 'avitoClientSecret') || ''
  )
  const avitoUserId = String(
    getCustomValue(customSettings, 'avitoUserId') || ''
  )
  const avitoWebhookToken = String(
    getCustomValue(customSettings, 'avitoWebhookToken') || ''
  )
  const avitoStatus = String(
    getCustomValue(customSettings, 'avitoStatus') || ''
  )
  const avitoLastError = String(
    getCustomValue(customSettings, 'avitoLastError') || ''
  )
  const avitoLastWebhookAt = String(
    getCustomValue(customSettings, 'avitoLastWebhookAt') || ''
  )
  const avitoWebhookUrl = useMemo(() => {
    const saved = String(
      getCustomValue(customSettings, 'avitoWebhookUrl') || ''
    )
    if (saved) return saved
    const token = avitoWebhookToken || generateAvitoSecret()
    const relative = `/api/integrations/avito/webhook/${token}`
    if (typeof window === 'undefined') return relative
    return `${window.location.origin}${relative}`
  }, [avitoWebhookToken, customSettings])
  const avitoStatusText = (() => {
    if (!avitoEnabled) return 'Отключено'
    if (avitoStatus === 'connected') return 'Подключено'
    if (avitoStatus === 'webhook_manual') return 'Нужно проверить webhook'
    if (avitoStatus === 'auth_error') return 'Ошибка авторизации'
    if (avitoStatus === 'disabled') return 'Отключено'
    return 'Настраивается'
  })()
  const vkEnabled = getCustomValue(customSettings, 'vkGroupEnabled') === true
  const vkGroupId = String(getCustomValue(customSettings, 'vkGroupId') || '')
  const vkAccessToken = String(
    getCustomValue(customSettings, 'vkGroupAccessToken') || ''
  )
  const vkConfirmationCode = String(
    getCustomValue(customSettings, 'vkGroupConfirmationCode') || ''
  )
  const vkWebhookSecret = String(
    getCustomValue(customSettings, 'vkGroupWebhookSecret') || ''
  )
  const vkWebhookToken = String(
    getCustomValue(customSettings, 'vkGroupWebhookToken') || ''
  )
  const vkStatus = String(getCustomValue(customSettings, 'vkGroupStatus') || '')
  const vkLastError = String(
    getCustomValue(customSettings, 'vkGroupLastError') || ''
  )
  const vkLastWebhookAt = String(
    getCustomValue(customSettings, 'vkGroupLastWebhookAt') || ''
  )
  const vkWebhookUrl = useMemo(() => {
    const saved = String(
      getCustomValue(customSettings, 'vkGroupWebhookUrl') || ''
    )
    if (saved) return saved
    const token = vkWebhookToken || generateVkSecret()
    const relative = `/api/integrations/vk/webhook/${token}`
    if (typeof window === 'undefined') return relative
    return `${window.location.origin}${relative}`
  }, [customSettings, vkWebhookToken])
  const vkDisplayedWebhookToken = useMemo(() => {
    if (vkWebhookToken) return vkWebhookToken
    const match = vkWebhookUrl.match(/\/vk\/webhook\/([^/?#]+)/)
    return match?.[1] || ''
  }, [vkWebhookToken, vkWebhookUrl])
  const vkDisplayedWebhookSecret = useMemo(
    () => vkWebhookSecret || generateVkCallbackSecret(),
    [vkWebhookSecret]
  )
  const vkStatusText = (() => {
    if (!vkEnabled) return 'Отключено'
    if (vkStatus === 'connected') return 'Подключено'
    if (vkStatus === 'auth_error') return 'Ошибка авторизации'
    if (vkStatus === 'disabled') return 'Отключено'
    return 'Настраивается'
  })()
  const telegramEnabled = Boolean(telegramStatusData?.enabled)
  const telegramAutoCreateClients =
    telegramStatusData?.autoCreateClients === true
  const telegramStatus = String(telegramStatusData?.status || 'disabled')
  const telegramStatusText = (() => {
    if (telegramStatus === 'connected') return 'Подключено к аккаунту'
    if (telegramStatus === 'bot_ready') {
      return 'Бот настроен — подключите его в Telegram Business'
    }
    if (telegramStatus === 'auth_error') return 'Ошибка подключения'
    return 'Отключено'
  })()
  const novofonWebhookUrl = useMemo(() => {
    const tenantId = loggedUser?.tenantId || loggedUser?._id || ''
    const path = '/api/telephony/novofon/webhook'
    if (!tenantId) return path
    const params = new URLSearchParams({ tenantId })
    if (novofonWebhookSecret) params.set('secret', novofonWebhookSecret)
    const relative = `${path}?${params.toString()}`
    if (typeof window === 'undefined') return relative
    return `${window.location.origin}${relative}`
  }, [loggedUser?._id, loggedUser?.tenantId, novofonWebhookSecret])

  const loadTelegramStatus = useCallback(async ({ showSuccess = false } = {}) => {
    setTelegramLoading(true)
    try {
      const response = await fetch('/api/integrations/telegram/status', {
        cache: 'no-store',
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result?.success === false) {
        if (showSuccess) {
          snackbar.error(result?.error?.message || 'Telegram не отвечает')
        }
        return false
      }
      setTelegramStatusData(result?.data || null)
      if (showSuccess) snackbar.success('Подключение Telegram проверено')
      return true
    } catch (error) {
      if (showSuccess) snackbar.error('Не удалось проверить Telegram')
      return false
    } finally {
      setTelegramLoading(false)
    }
  }, [snackbar])

  useEffect(() => {
    let active = true
    const loadGoogleCalendarStatus = async () => {
      setGoogleCalendarLoading(true)
      try {
        const response = await fetch('/api/google-calendar/status')
        const result = await response.json()
        if (!active) return
        setGoogleCalendarConnected(Boolean(result?.data?.connected))
      } catch (error) {
        if (active) setGoogleCalendarConnected(false)
      } finally {
        if (active) setGoogleCalendarLoading(false)
      }
    }

    if (canUseCalendar) loadGoogleCalendarStatus()
    return () => {
      active = false
    }
  }, [canUseCalendar])

  useEffect(() => {
    if (canUseTelegram) loadTelegramStatus()
  }, [canUseTelegram, loadTelegramStatus])

  useEffect(() => {
    let active = true
    const loadAiUsage = async () => {
      setAiUsageLoading(true)
      try {
        const response = await fetch('/api/ai/usage', { cache: 'no-store' })
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result?.error || 'AI usage failed')
        if (active) setAiUsage(result?.data || null)
      } catch (error) {
        if (active) setAiUsage(null)
      } finally {
        if (active) setAiUsageLoading(false)
      }
    }
    if (canUseAi) loadAiUsage()
    return () => {
      active = false
    }
  }, [canUseAi])

  const saveCustom = async (patch, options = {}) => {
    let saved = false
    setIsSaving(true)
    try {
      await postData(
        '/api/site',
        {
          custom: {
            ...(siteSettings?.custom ?? {}),
            ...patch,
          },
        },
        (data) => {
          setSiteSettings(data)
          saved = true
        },
        () => snackbar.error('Не удалось сохранить настройки'),
        false,
        null
      )
      if (saved && options?.successMessage) {
        snackbar.success(options.successMessage)
      }
    } finally {
      setIsSaving(false)
    }
    return saved
  }

  const saveTelegramAutoCreateClients = async () => {
    if (isSaving) return
    const nextValue = !telegramAutoCreateClients
    const saved = await saveCustom(
      { telegramBusinessAutoCreateClients: nextValue },
      {
        successMessage: nextValue
          ? 'Автосоздание клиентов Telegram включено'
          : 'Автосоздание клиентов Telegram отключено',
      }
    )
    if (saved) {
      setTelegramStatusData((current) => ({
        ...(current || {}),
        autoCreateClients: nextValue,
      }))
    }
  }

  const selectAiProvider = (provider) => {
    const isDeepseek = provider === 'deepseek'
    const isPlatform = provider === 'artistcrm'
    return saveCustom(
      {
        aiIntegrationEnabled: true,
        aiAnalysisProvider: provider,
        aiAnalysisModel: isDeepseek
          ? aiAnalysisProvider === 'deepseek' && aiAnalysisModel
            ? aiAnalysisModel
            : 'deepseek-v4-flash'
          : !isPlatform && aiAnalysisProvider === 'aitunnel' && aiAnalysisModel
            ? aiAnalysisModel
            : 'gpt-4o-mini',
        ...(isDeepseek
          ? {}
          : isPlatform
            ? {
                aiTranscriptionProvider: 'artistcrm',
                aiTranscriptionModel: 'whisper-1',
              }
            : {
                aitunnelEnabled: true,
                aiTranscriptionProvider: 'aitunnel',
                aiTranscriptionModel: aiTranscriptionModel || 'whisper-1',
              }),
      },
      {
        successMessage: `Выбран провайдер ${
          isDeepseek ? 'DeepSeek' : isPlatform ? 'ИИ Ведело' : 'AITunnel'
        }`,
      }
    )
  }

  const saveApiKeys = (nextApiKeys) => {
    const normalized = nextApiKeys.map((item) => ({
      id: item.id || generateApiKeyId(),
      name: String(item.name || '').trim() || 'Источник API',
      key: item.key,
      enabled: item.enabled !== false,
    }))
    return saveCustom({
      publicLeadApiKeys: normalized,
      publicLeadApiKey: normalized[0]?.key ?? '',
    })
  }

  const upsertApiKey = (apiKey) => {
    const exists = apiKeys.some((item) => item.id === apiKey.id)
    const nextApiKeys = exists
      ? apiKeys.map((item) => (item.id === apiKey.id ? apiKey : item))
      : [...apiKeys, apiKey]
    return saveApiKeys(nextApiKeys)
  }

  const openApiKeyEditor = (apiKey = null) => {
    modalsFunc.add({
      title: apiKey ? 'Редактирование API-ключа' : 'Новый API-ключ',
      Children: (props) => (
        <ApiKeyEditorModal
          {...props}
          initialApiKey={
            apiKey || {
              id: '',
              name: `Источник ${apiKeys.length + 1}`,
              key: generateApiKey(),
              enabled: true,
            }
          }
          onSave={upsertApiKey}
        />
      ),
    })
  }

  const deleteApiKey = (apiKey) => {
    modalsFunc.add({
      title: 'Удаление API-ключа',
      text: `Удалить ключ "${apiKey.name}"? Интеграции, которые используют этот ключ, перестанут отправлять заявки.`,
      confirmButtonName: 'Удалить',
      onConfirm: () =>
        saveApiKeys(apiKeys.filter((item) => item.id !== apiKey.id)),
    })
  }

  const connectAvito = async () => {
    setAvitoLoading(true)
    try {
      const response = await fetch('/api/integrations/avito/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: avitoClientId,
          clientSecret: avitoClientSecret,
          userId: avitoUserId,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (result?.data?.siteSettings) setSiteSettings(result.data.siteSettings)
      if (!response.ok || result?.success === false) {
        snackbar.error(result?.error?.message || 'Не удалось подключить Avito')
        return
      }
      if (result?.data?.avito?.webhookRegistered) {
        snackbar.success('Avito подключен')
      } else {
        snackbar.warning('Доступ проверен, webhook нужно проверить вручную')
      }
    } catch (error) {
      snackbar.error('Не удалось подключить Avito')
    } finally {
      setAvitoLoading(false)
    }
  }

  const checkAvito = async () => {
    setAvitoLoading(true)
    try {
      const response = await fetch('/api/integrations/avito/status', {
        method: 'POST',
      })
      const result = await response.json().catch(() => ({}))
      if (result?.data?.siteSettings) setSiteSettings(result.data.siteSettings)
      if (!response.ok || result?.success === false) {
        snackbar.error(result?.error?.message || 'Avito не отвечает')
        return
      }
      snackbar.success('Доступ Avito проверен')
    } catch (error) {
      snackbar.error('Не удалось проверить Avito')
    } finally {
      setAvitoLoading(false)
    }
  }

  const disconnectAvito = async () => {
    setAvitoLoading(true)
    try {
      const response = await fetch('/api/integrations/avito/disconnect', {
        method: 'POST',
      })
      const result = await response.json().catch(() => ({}))
      if (result?.data?.siteSettings) setSiteSettings(result.data.siteSettings)
      if (!response.ok || result?.success === false) {
        snackbar.error('Не удалось отключить Avito')
        return
      }
      snackbar.success('Avito отключен')
    } catch (error) {
      snackbar.error('Не удалось отключить Avito')
    } finally {
      setAvitoLoading(false)
    }
  }

  const connectVk = async () => {
    setVkLoading(true)
    try {
      const response = await fetch('/api/integrations/vk/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: vkGroupId,
          accessToken: vkAccessToken,
          confirmationCode: vkConfirmationCode,
          webhookToken: vkDisplayedWebhookToken,
          webhookSecret: vkDisplayedWebhookSecret,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (result?.data?.siteSettings) setSiteSettings(result.data.siteSettings)
      if (!response.ok || result?.success === false) {
        snackbar.error(result?.error?.message || 'Не удалось подключить VK')
        return
      }
      snackbar.success('VK подключен')
    } catch (error) {
      snackbar.error('Не удалось подключить VK')
    } finally {
      setVkLoading(false)
    }
  }

  const checkVk = async () => {
    setVkLoading(true)
    try {
      const response = await fetch('/api/integrations/vk/status', {
        method: 'POST',
      })
      const result = await response.json().catch(() => ({}))
      if (result?.data?.siteSettings) setSiteSettings(result.data.siteSettings)
      if (!response.ok || result?.success === false) {
        snackbar.error(result?.error?.message || 'VK не отвечает')
        return
      }
      snackbar.success('Доступ VK проверен')
    } catch (error) {
      snackbar.error('Не удалось проверить VK')
    } finally {
      setVkLoading(false)
    }
  }

  const disconnectVk = async () => {
    setVkLoading(true)
    try {
      const response = await fetch('/api/integrations/vk/disconnect', {
        method: 'POST',
      })
      const result = await response.json().catch(() => ({}))
      if (result?.data?.siteSettings) setSiteSettings(result.data.siteSettings)
      if (!response.ok || result?.success === false) {
        snackbar.error('Не удалось отключить VK')
        return
      }
      snackbar.success('VK отключен')
    } catch (error) {
      snackbar.error('Не удалось отключить VK')
    } finally {
      setVkLoading(false)
    }
  }

  const connectTelegram = async () => {
    const botToken = telegramBotToken.trim()
    if (!botToken) return
    setTelegramLoading(true)
    try {
      const response = await fetch('/api/integrations/telegram/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken }),
      })
      const result = await response.json().catch(() => ({}))
      if (result?.data?.siteSettings) setSiteSettings(result.data.siteSettings)
      if (!response.ok || result?.success === false) {
        snackbar.error(
          result?.error?.message || 'Не удалось подключить Telegram'
        )
        return
      }
      setTelegramBotToken('')
      setTelegramStatusData(result?.data?.telegramBusiness || null)
      await loadTelegramStatus()
      snackbar.success('Бот настроен. Теперь подключите его в Telegram Business')
    } catch (error) {
      snackbar.error('Не удалось подключить Telegram')
    } finally {
      setTelegramLoading(false)
    }
  }

  const checkTelegram = async () => {
    setTelegramLoading(true)
    try {
      const response = await fetch('/api/integrations/telegram/status', {
        method: 'POST',
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result?.success === false) {
        snackbar.error(result?.error?.message || 'Telegram не отвечает')
        return
      }
      setTelegramStatusData(result?.data || null)
      snackbar.success('Подключение Telegram проверено')
    } catch (error) {
      snackbar.error('Не удалось проверить Telegram')
    } finally {
      setTelegramLoading(false)
    }
  }

  const disconnectTelegram = async () => {
    setTelegramLoading(true)
    try {
      const response = await fetch('/api/integrations/telegram/disconnect', {
        method: 'POST',
      })
      const result = await response.json().catch(() => ({}))
      if (result?.data?.siteSettings) setSiteSettings(result.data.siteSettings)
      if (!response.ok || result?.success === false) {
        snackbar.error('Не удалось отключить Telegram')
        return
      }
      setTelegramBotToken('')
      setTelegramStatusData(null)
      snackbar.success('Telegram отключен')
    } catch (error) {
      snackbar.error('Не удалось отключить Telegram')
    } finally {
      setTelegramLoading(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {canUseCalendar ? (
          <IntegrationAccordion
            title="Google Calendar"
            description="Синхронизация мероприятий, уведомления, цвета и состав данных."
            connected={googleCalendarConnected}
            loading={googleCalendarLoading}
          >
            <GoogleCalendarSettings redirectPath="/cabinet/integrations" />
          </IntegrationAccordion>
        ) : null}

        {canUsePublicLeadApi ? (
          <IntegrationAccordion
            title="Входящие заявки API"
            description="Ключи для сайта, Tilda и других источников заявок."
            connected={isEnabled && apiKeys.some((item) => item.enabled)}
          >
            <div className="flex flex-col gap-3">
              <div className="text-sm text-gray-600">
                Создайте отдельный ключ для каждого источника заявок. Название
                ключа будет показано на карточке заявки/мероприятия
              </div>

              <IconCheckBox
                label="Принимать заявки через API"
                checked={isEnabled}
                onClick={() => saveCustom({ publicLeadEnabled: !isEnabled })}
                noMargin
              />

              <Input
                label="Endpoint"
                value={endpointUrl}
                onChange={() => {}}
                disabled
                noMargin
                fullWidth
              />

              <div className="tablet:grid-cols-2 grid grid-cols-1 gap-2">
                {apiKeys.length === 0 ? (
                  <div className="tablet:col-span-2 rounded border border-dashed border-gray-300 bg-gray-50 px-3 py-3 text-sm text-gray-600">
                    Ключей пока нет. Создайте первый ключ для сайта, Tilda или
                    другого источника заявок.
                  </div>
                ) : (
                  apiKeys.map((item) => (
                    <div
                      key={item.id}
                      className="flex w-full justify-between gap-2 rounded border border-gray-200 bg-white p-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-900">
                          {item.name}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {item.key
                            ? `...${item.key.slice(-8)}`
                            : 'Ключ не задан'}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            item.enabled
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                              : 'border-gray-300 bg-gray-100 text-gray-600'
                          }`}
                        >
                          {item.enabled ? 'Активен' : 'Отключен'}
                        </span>
                        <div className="flex shrink-0 justify-end gap-2">
                          <IconActionButton
                            icon={faPencilAlt}
                            size="sm"
                            variant="warning"
                            title="Настроить ключ"
                            onClick={() => openApiKeyEditor(item)}
                          />
                          <IconActionButton
                            icon={faTrash}
                            size="sm"
                            variant="danger"
                            title="Удалить ключ"
                            onClick={() => deleteApiKey(item)}
                            disabled={isSaving}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="action-icon-button action-icon-button--success tablet:w-auto flex h-10 w-full cursor-pointer items-center justify-center rounded px-3 text-sm font-semibold"
                  onClick={() => openApiKeyEditor()}
                  disabled={isSaving}
                >
                  Добавить ключ
                </button>
                <InstructionButton
                  onClick={() =>
                    modalsFunc.add({
                      title: 'Инструкция API',
                      showDecline: true,
                      declineButtonName: 'Закрыть',
                      Children: IntegrationsApiGuide,
                    })
                  }
                >
                  Открыть инструкцию API
                </InstructionButton>
              </div>
            </div>
          </IntegrationAccordion>
        ) : null}

        {canUseAvito ? (
          <IntegrationAccordion
            title="Avito"
            description="Персональная интеграция сообщений Avito в заявки CRM."
            connected={avitoEnabled && avitoStatus !== 'auth_error'}
            warning={avitoEnabled && avitoStatus !== 'connected'}
            loading={avitoLoading}
          >
            <div className="flex flex-col gap-3">
              <div className="text-sm text-gray-600">
                Подключение выполняется отдельно для вашего аккаунта Avito.
                Сообщения из новых чатов будут попадать в CRM как заявки со
                статусом Черновик.
              </div>

              <Notice
                tone={
                  avitoEnabled && avitoStatus !== 'auth_error'
                    ? 'success'
                    : avitoStatus === 'auth_error'
                      ? 'error'
                      : 'neutral'
                }
                className="rounded"
              >
                Статус: {avitoStatusText}
                {avitoLastWebhookAt ? (
                  <span className="block text-xs">
                    Последнее событие:{' '}
                    {new Date(avitoLastWebhookAt).toLocaleString()}
                  </span>
                ) : null}
                {avitoLastError ? (
                  <span className="block text-xs">
                    Ошибка: {avitoLastError}
                  </span>
                ) : null}
              </Notice>

              <div className="tablet:grid-cols-2 grid grid-cols-1 gap-3">
                <Input
                  label="Avito Client ID"
                  value={avitoClientId}
                  onChange={(value) => saveCustom({ avitoClientId: value })}
                  noMargin
                  fullWidth
                />
                <Input
                  label="Avito User ID"
                  value={avitoUserId}
                  onChange={(value) => saveCustom({ avitoUserId: value })}
                  noMargin
                  fullWidth
                />
              </div>

              <Input
                label="Avito Client Secret"
                value={avitoClientSecret}
                onChange={(value) => saveCustom({ avitoClientSecret: value })}
                type="password"
                noMargin
                fullWidth
              />

              <div className="flex items-start gap-2">
                <Input
                  label="Адрес webhook Avito"
                  value={avitoWebhookUrl}
                  onChange={() => {}}
                  disabled
                  noMargin
                  fullWidth
                />
                <IconActionButton
                  icon={faCopy}
                  size="md"
                  variant="success"
                  title="Скопировать webhook"
                  className="shrink-0"
                  onClick={async () => {
                    if (!avitoWebhookUrl || !navigator?.clipboard) return
                    await navigator.clipboard.writeText(avitoWebhookUrl)
                    snackbar.success('Webhook скопирован')
                  }}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="action-icon-button action-icon-button--success tablet:w-auto flex h-10 w-full cursor-pointer items-center justify-center rounded px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={connectAvito}
                  disabled={
                    avitoLoading || !avitoClientId || !avitoClientSecret
                  }
                >
                  {avitoEnabled ? 'Переподключить' : 'Подключить'}
                </button>
                <button
                  type="button"
                  className="action-icon-button action-icon-button--warning tablet:w-auto flex h-10 w-full cursor-pointer items-center justify-center rounded px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={checkAvito}
                  disabled={
                    avitoLoading || !avitoClientId || !avitoClientSecret
                  }
                >
                  Проверить
                </button>
                <button
                  type="button"
                  className="action-icon-button action-icon-button--danger tablet:w-auto flex h-10 w-full cursor-pointer items-center justify-center rounded px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={disconnectAvito}
                  disabled={avitoLoading || !avitoEnabled}
                >
                  Отключить
                </button>
                <InstructionButton
                  onClick={() =>
                    modalsFunc.add({
                      title: 'Как подключить Avito',
                      showDecline: true,
                      declineButtonName: 'Закрыть',
                      Children: AvitoGuide,
                    })
                  }
                >
                  Как подключить
                </InstructionButton>
              </div>
            </div>
          </IntegrationAccordion>
        ) : null}

        {canUseVk ? (
          <IntegrationAccordion
            title="VK"
            description="Персональная интеграция сообщений группы VK в заявки CRM."
            connected={vkEnabled && vkStatus !== 'auth_error'}
            warning={vkEnabled && vkStatus !== 'connected'}
            loading={vkLoading}
          >
            <div className="flex flex-col gap-3">
              <div className="text-sm text-gray-600">
                Подключение выполняется отдельно для вашей группы VK. Сообщения
                из новых диалогов будут попадать в CRM как заявки со статусом
                Черновик.
              </div>

              <Notice
                tone={
                  vkEnabled && vkStatus !== 'auth_error'
                    ? 'success'
                    : vkStatus === 'auth_error'
                      ? 'error'
                      : 'neutral'
                }
                className="rounded"
              >
                Статус: {vkStatusText}
                {vkLastWebhookAt ? (
                  <span className="block text-xs">
                    Последнее событие:{' '}
                    {new Date(vkLastWebhookAt).toLocaleString()}
                  </span>
                ) : null}
                {vkLastError ? (
                  <span className="block text-xs">Ошибка: {vkLastError}</span>
                ) : null}
              </Notice>

              <div className="tablet:grid-cols-2 grid grid-cols-1 gap-3">
                <Input
                  label="VK Group ID"
                  value={vkGroupId}
                  onChange={(value) => saveCustom({ vkGroupId: value })}
                  noMargin
                  fullWidth
                />
                <Input
                  label="Строка подтверждения Callback API"
                  value={vkConfirmationCode}
                  onChange={(value) =>
                    saveCustom({ vkGroupConfirmationCode: value })
                  }
                  noMargin
                  fullWidth
                />
              </div>

              <Input
                label="Токен сообщества VK"
                value={vkAccessToken}
                onChange={(value) => saveCustom({ vkGroupAccessToken: value })}
                type="password"
                noMargin
                fullWidth
              />

              <div className="tablet:grid-cols-2 grid grid-cols-1 gap-3">
                <div className="flex items-start gap-2">
                  <Input
                    label="Адрес webhook VK"
                    value={vkWebhookUrl}
                    onChange={() => {}}
                    disabled
                    noMargin
                    fullWidth
                  />
                  <IconActionButton
                    icon={faCopy}
                    size="md"
                    variant="success"
                    title="Скопировать webhook"
                    className="shrink-0"
                    onClick={async () => {
                      if (!vkWebhookUrl || !navigator?.clipboard) return
                      if (!vkWebhookToken && vkDisplayedWebhookToken) {
                        await saveCustom({
                          vkGroupWebhookToken: vkDisplayedWebhookToken,
                        })
                      }
                      await navigator.clipboard.writeText(vkWebhookUrl)
                      snackbar.success('Webhook скопирован')
                    }}
                  />
                </div>
                <div className="flex items-start gap-2">
                  <Input
                    label="Secret key Callback API"
                    value={vkDisplayedWebhookSecret}
                    onChange={(value) =>
                      saveCustom({ vkGroupWebhookSecret: value })
                    }
                    noMargin
                    fullWidth
                  />
                  <IconActionButton
                    icon={faCopy}
                    size="md"
                    variant="success"
                    title="Скопировать secret key"
                    className="shrink-0"
                    onClick={async () => {
                      const secret = vkDisplayedWebhookSecret
                      if (!secret || !navigator?.clipboard) return
                      if (!vkWebhookSecret) {
                        await saveCustom({ vkGroupWebhookSecret: secret })
                      }
                      await navigator.clipboard.writeText(secret)
                      snackbar.success('Secret key скопирован')
                    }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="action-icon-button action-icon-button--success tablet:w-auto flex h-10 w-full cursor-pointer items-center justify-center rounded px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={connectVk}
                  disabled={
                    vkLoading ||
                    !vkGroupId ||
                    !vkAccessToken ||
                    !vkConfirmationCode
                  }
                >
                  {vkEnabled ? 'Переподключить' : 'Подключить'}
                </button>
                <button
                  type="button"
                  className="action-icon-button action-icon-button--warning tablet:w-auto flex h-10 w-full cursor-pointer items-center justify-center rounded px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={checkVk}
                  disabled={vkLoading || !vkGroupId || !vkAccessToken}
                >
                  Проверить
                </button>
                <button
                  type="button"
                  className="action-icon-button action-icon-button--danger tablet:w-auto flex h-10 w-full cursor-pointer items-center justify-center rounded px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={disconnectVk}
                  disabled={vkLoading || !vkEnabled}
                >
                  Отключить
                </button>
                <InstructionButton
                  onClick={() =>
                    modalsFunc.add({
                      title: 'Как подключить VK',
                      showDecline: true,
                      declineButtonName: 'Закрыть',
                      Children: VkGuide,
                    })
                  }
                >
                  Как подключить
                </InstructionButton>
              </div>
            </div>
          </IntegrationAccordion>
        ) : null}

        {canUseTelegram ? (
          <IntegrationAccordion
            title="Telegram Business"
            description="Переписка с клиентами и ответы от имени вашего Telegram-аккаунта."
            connected={telegramStatus === 'connected'}
            warning={telegramEnabled && telegramStatus !== 'connected'}
            loading={telegramLoading}
          >
            <div className="flex flex-col gap-3">
              <div className="text-sm text-gray-600">
                Подключите собственного Business Bot. Новые сообщения будут
                сохраняться в CRM, а отвечать можно из модального окна «Диалог
                с клиентом». Создание карточек для неизвестных контактов
                настраивается ниже.
              </div>

              <Notice
                tone={
                  telegramStatus === 'connected'
                    ? 'success'
                    : telegramStatus === 'auth_error'
                      ? 'error'
                      : telegramEnabled
                        ? 'warning'
                        : 'neutral'
                }
                className="rounded"
              >
                Статус: {telegramStatusText}
                {telegramStatusData?.botUsername ? (
                  <span className="block text-xs">
                    Бот: @{telegramStatusData.botUsername}
                  </span>
                ) : null}
                <span className="block text-xs">
                  Исходящие запросы:{' '}
                  {telegramStatusData?.proxyEnabled
                    ? `через ${String(
                        telegramStatusData.proxyType || 'HTTP'
                      ).toUpperCase()}-прокси`
                    : 'напрямую с сервера'}
                </span>
                {telegramStatusData?.lastMessageAt ? (
                  <span className="block text-xs">
                    Последнее сообщение:{' '}
                    {new Date(telegramStatusData.lastMessageAt).toLocaleString()}
                  </span>
                ) : null}
                {telegramStatusData?.lastError ? (
                  <span className="block text-xs">
                    Ошибка: {telegramStatusData.lastError}
                  </span>
                ) : null}
              </Notice>

              <Input
                label={
                  telegramStatusData?.hasBotToken
                    ? 'Новый токен бота для переподключения'
                    : 'Токен бота из BotFather'
                }
                value={telegramBotToken}
                onChange={setTelegramBotToken}
                type="password"
                noMargin
                fullWidth
              />

              <Notice tone="info" className="rounded text-xs leading-5">
                Сначала включите у бота Secretary Mode / «Режим секретаря» в
                настройках @BotFather. Затем добавьте его в Telegram: Настройки
                → Telegram Business → Чат-боты и выдайте права на чтение и
                ответы. Старые сообщения до подключения в CRM не загрузятся.
              </Notice>

              <div className="rounded border border-gray-200 bg-white px-3 py-3">
                <IconCheckBox
                  label="Создавать карточку клиента, если контакта Telegram нет в базе клиентов"
                  checked={telegramAutoCreateClients}
                  onClick={saveTelegramAutoCreateClients}
                  noMargin
                />
                <div className="mt-2 text-xs leading-5 text-gray-500">
                  Если выключить настройку, новые сообщения сохранятся как
                  непривязанные Telegram-диалоги. Их можно будет привязать к
                  клиенту вручную. При создании карточки Ведело отправит
                  уведомление, если уведомления включены.
                </div>
                <Notice
                  tone="warning"
                  className="mt-2 rounded text-xs font-medium leading-5"
                >
                  Важно: не включайте эту настройку, если бот подключён к вашему
                  личному Telegram-аккаунту. Иначе Ведело будет создавать
                  карточки для друзей, родственников и других личных контактов,
                  которые напишут вам в Telegram.
                </Notice>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="action-icon-button action-icon-button--success tablet:w-auto flex h-10 w-full cursor-pointer items-center justify-center rounded px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={connectTelegram}
                  disabled={telegramLoading || !telegramBotToken.trim()}
                >
                  {telegramEnabled ? 'Переподключить' : 'Подключить'}
                </button>
                <button
                  type="button"
                  className="action-icon-button action-icon-button--warning tablet:w-auto flex h-10 w-full cursor-pointer items-center justify-center rounded px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={checkTelegram}
                  disabled={
                    telegramLoading || !telegramStatusData?.hasBotToken
                  }
                >
                  Проверить
                </button>
                <button
                  type="button"
                  className="action-icon-button action-icon-button--danger tablet:w-auto flex h-10 w-full cursor-pointer items-center justify-center rounded px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={disconnectTelegram}
                  disabled={telegramLoading || !telegramEnabled}
                >
                  Отключить
                </button>
                <InstructionButton
                  onClick={() =>
                    modalsFunc.add({
                      title: 'Как подключить Telegram Business',
                      showDecline: true,
                      declineButtonName: 'Закрыть',
                      Children: TelegramBusinessGuide,
                    })
                  }
                >
                  Как подключить
                </InstructionButton>
              </div>
            </div>
          </IntegrationAccordion>
        ) : null}

        {canUseTelephony ? (
          <IntegrationAccordion
            title="Novofon IP-телефония"
            description="Прием звонков в CRM и подготовка заявки после разговора."
            connected={novofonEnabled && Boolean(novofonApiKey)}
            warning={novofonEnabled && !novofonApiKey}
          >
            <div className="flex flex-col gap-3">
              <div className="text-sm text-gray-600">
                Подключите свой аккаунт Novofon, чтобы звонки попадали в CRM.
                После разговора можно будет открыть звонок, добавить заметку,
                распознать запись и подготовить черновик заявки.
              </div>

              <IconCheckBox
                label="Включить интеграцию Novofon"
                checked={novofonEnabled}
                onClick={() =>
                  saveCustom({
                    novofonEnabled: !novofonEnabled,
                    novofonWebhookSecret:
                      novofonWebhookSecret || generateNovofonSecret(),
                  })
                }
                noMargin
              />

              <Input
                label="Ключ Novofon"
                value={novofonApiKey}
                onChange={(value) => saveCustom({ novofonApiKey: value })}
                noMargin
                fullWidth
              />

              <div className="flex items-start gap-2">
                <Input
                  label="Секретный ключ"
                  value={novofonWebhookSecret}
                  onChange={() => {}}
                  disabled
                  noMargin
                  fullWidth
                />
                <IconActionButton
                  icon={faCopy}
                  size="md"
                  variant="success"
                  title="Скопировать секретный ключ"
                  className="shrink-0"
                  onClick={async () => {
                    if (!novofonWebhookSecret || !navigator?.clipboard) return
                    await navigator.clipboard.writeText(novofonWebhookSecret)
                    snackbar.success('Секретный ключ скопирован')
                  }}
                />
              </div>

              <div className="flex items-start gap-2">
                <Input
                  label="Адрес для уведомлений Novofon"
                  value={novofonWebhookUrl}
                  onChange={() => {}}
                  disabled
                  noMargin
                  fullWidth
                />
                <IconActionButton
                  icon={faCopy}
                  size="md"
                  variant="success"
                  title="Скопировать адрес"
                  className="shrink-0"
                  onClick={async () => {
                    if (!novofonWebhookUrl || !navigator?.clipboard) return
                    await navigator.clipboard.writeText(novofonWebhookUrl)
                    snackbar.success('Адрес скопирован')
                  }}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="action-icon-button action-icon-button--warning tablet:w-auto flex h-10 w-full cursor-pointer items-center justify-center rounded px-3 text-sm font-semibold"
                  onClick={() =>
                    saveCustom({
                      novofonWebhookSecret: generateNovofonSecret(),
                    })
                  }
                  disabled={isSaving}
                >
                  Обновить секретный ключ
                </button>
                <InstructionButton
                  onClick={() =>
                    modalsFunc.add({
                      title: 'Как подключить Novofon',
                      showDecline: true,
                      declineButtonName: 'Закрыть',
                      Children: NovofonGuide,
                    })
                  }
                >
                  Как подключить
                </InstructionButton>
              </div>
            </div>
          </IntegrationAccordion>
        ) : null}

        {canUseAi ? (
          <IntegrationAccordion
            title="ИИ-провайдер"
            description="ИИ Ведело с оплатой из баланса или ваш собственный AITunnel."
            connected={isAiProviderConnected}
            warning={
              aiIntegrationEnabled &&
              (!isAiProviderConfigured ||
                (aiAnalysisProvider === 'artistcrm' && !aiUsage?.available))
            }
          >
            <div className="flex flex-col gap-3">
              <div className="text-sm text-gray-600">
                Выберите сервис, который будет анализировать текст и заполнять
                черновики мероприятий. Общий ИИ не требует ключа и оплачивается
                из баланса. При собственном ключе списаний со стороны Ведело
                нет.
              </div>
              {!canUseTelephony && (
                <Notice tone="warning" className="rounded-md">
                  AI-обработка звонков будет работать после подключения тарифа с
                  IP-телефонией.
                </Notice>
              )}
              <IconCheckBox
                label="Включить ИИ-интеграцию"
                checked={aiIntegrationEnabled}
                onClick={() =>
                  saveCustom(
                    {
                      aiIntegrationEnabled: !aiIntegrationEnabled,
                      aiAnalysisProvider,
                    },
                    {
                      successMessage: !aiIntegrationEnabled
                        ? 'ИИ-интеграция включена'
                        : 'ИИ-интеграция приостановлена',
                    }
                  )
                }
                noMargin
              />
              <Select
                label="Провайдер AI-анализа"
                value={aiAnalysisProvider}
                onChange={selectAiProvider}
                options={[
                  { value: 'artistcrm', label: 'ИИ Ведело' },
                  { value: 'aitunnel', label: 'Свой AITunnel' },
                  ...(isDeveloper
                    ? [{ value: 'deepseek', label: 'DeepSeek (разработчик)' }]
                    : []),
                ]}
                noMargin
                fullWidth
              />
              {aiAnalysisProvider === 'artistcrm' ? (
                <div className="ai-billing-card flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                  {aiUsageLoading ? (
                    <div className="ai-billing-card__description text-sm text-blue-800">
                      Загружаем баланс и расходы...
                    </div>
                  ) : (
                    <>
                      <div className="tablet:grid-cols-3 grid grid-cols-1 gap-2">
                        <div>
                          <div className="ai-billing-card__label text-xs text-blue-700">
                            Баланс
                          </div>
                          <div className="ai-billing-card__value font-semibold text-blue-950">
                            {formatMoney(aiUsage?.balance || 0)}
                          </div>
                        </div>
                        <div>
                          <div className="ai-billing-card__label text-xs text-blue-700">
                            Макс. текущий порог
                          </div>
                          <div className="ai-billing-card__value font-semibold text-blue-950">
                            больше {formatMoney(aiUsage?.requiredBalance || 0)}
                          </div>
                        </div>
                        <div>
                          <div className="ai-billing-card__label text-xs text-blue-700">
                            Всего списано
                          </div>
                          <div className="ai-billing-card__value font-semibold text-blue-950">
                            {formatMoney(aiUsage?.summary?.charged || 0)} ·{' '}
                            {aiUsage?.summary?.operations || 0} операций
                          </div>
                        </div>
                      </div>
                      <div className="tablet:grid-cols-2 grid grid-cols-1 gap-2">
                        <div className="ai-billing-estimate rounded-md border border-blue-100 bg-white/60 px-3 py-2">
                          <div className="ai-billing-card__label text-xs text-blue-700">
                            Голосовое сообщение
                          </div>
                          <div className="ai-billing-card__value font-semibold text-blue-950">
                            ≈ {formatMoney(aiAverageCosts.voiceMessage)}
                          </div>
                          <div className="ai-billing-card__description text-xs text-blue-800">
                            Распознавание речи
                          </div>
                        </div>
                        <div className="ai-billing-estimate rounded-md border border-blue-100 bg-white/60 px-3 py-2">
                          <div className="ai-billing-card__label text-xs text-blue-700">
                            Звонок из телефонии
                          </div>
                          <div className="ai-billing-card__value font-semibold text-blue-950">
                            ≈ {formatMoney(aiAverageCosts.phoneCall)}
                          </div>
                          <div className="ai-billing-card__description text-xs text-blue-800">
                            Расшифровка и анализ звонка
                          </div>
                        </div>
                      </div>
                      <div className="ai-billing-card__description text-xs text-blue-800">
                        Ориентир рассчитан по последним операциям. Длинные
                        записи могут стоить дороже.
                      </div>
                      {!aiUsage?.platformConfigured ? (
                        <Notice
                          tone="error"
                          role="alert"
                          className="ai-billing-card__danger rounded-md"
                        >
                          Общий ИИ временно не настроен администратором.
                        </Notice>
                      ) : !aiUsage?.available ? (
                        <Notice
                          tone="warning"
                          className="ai-billing-card__warning rounded-md"
                        >
                          Для части ИИ-операций недостаточно средств. Пополните
                          баланс так, чтобы он был больше средней стоимости
                          нужной операции, или подключите свой AITunnel.
                        </Notice>
                      ) : null}
                    </>
                  )}
                </div>
              ) : (
                <div className="tablet:grid-cols-2 grid grid-cols-1 gap-3">
                  {aiAnalysisProvider === 'deepseek' ? (
                    <Input
                      label="API-ключ DeepSeek"
                      type="password"
                      value={deepseekKey}
                      onChange={(value) => saveCustom({ deepseekKey: value })}
                      noMargin
                      fullWidth
                    />
                  ) : (
                    <Input
                      label="Ключ AITunnel"
                      type="password"
                      value={aitunnelKey}
                      onChange={(value) =>
                        saveCustom({
                          aitunnelKey: value,
                          aitunnelEnabled: Boolean(value),
                          aiTranscriptionProvider: value ? 'aitunnel' : '',
                        })
                      }
                      noMargin
                      fullWidth
                    />
                  )}
                  <Input
                    label="Модель AI-анализа"
                    value={aiAnalysisModel}
                    onChange={(value) =>
                      saveCustom({
                        aiAnalysisProvider,
                        aiAnalysisModel: value,
                      })
                    }
                    noMargin
                    fullWidth
                  />
                </div>
              )}
              {aiAnalysisProvider === 'aitunnel' ? (
                <Input
                  label="Модель распознавания записей звонков"
                  value={aiTranscriptionModel}
                  onChange={(value) =>
                    saveCustom({
                      aiTranscriptionProvider: 'aitunnel',
                      aiTranscriptionModel: value,
                    })
                  }
                  noMargin
                  fullWidth
                />
              ) : aiAnalysisProvider === 'deepseek' ? (
                <Notice tone="info" className="flex flex-col gap-3 rounded-md p-3">
                  <div>
                    DeepSeek доступен только разработчику и анализирует готовый
                    текст. Для расшифровки аудиозаписей звонков нужен отдельный
                    ключ AITunnel.
                  </div>
                  <div className="tablet:grid-cols-2 grid grid-cols-1 gap-3">
                    <Input
                      label="Ключ AITunnel для распознавания (необязательно)"
                      type="password"
                      value={aitunnelKey}
                      onChange={(value) =>
                        saveCustom({
                          aitunnelKey: value,
                          aitunnelEnabled: Boolean(value),
                          aiTranscriptionProvider: value ? 'aitunnel' : '',
                        })
                      }
                      noMargin
                      fullWidth
                    />
                    <Input
                      label="Модель распознавания"
                      value={aiTranscriptionModel}
                      onChange={(value) =>
                        saveCustom({
                          aiTranscriptionProvider: 'aitunnel',
                          aiTranscriptionModel: value,
                        })
                      }
                      disabled={!aitunnelKey}
                      noMargin
                      fullWidth
                    />
                  </div>
                </Notice>
              ) : null}
              {aiUsage?.recent?.length > 0 ? (
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="mb-2 font-semibold text-gray-900">
                    Последние расходы ИИ Ведело
                  </div>
                  <div className="flex flex-col divide-y divide-gray-100 text-sm">
                    {aiUsage.recent.slice(0, 5).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <div>
                          <div className="text-gray-800">
                            {{
                              call_transcription: 'Расшифровка звонка',
                              call_analysis: 'Анализ звонка',
                              voice_transcription: 'Голосовой ввод',
                              event_draft: 'Черновик мероприятия',
                              calendar_import: 'Импорт Google Calendar',
                              file_analysis: 'Анализ файла',
                              file_import: 'Импорт из файла',
                            }[item.feature] || item.feature}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(item.createdAt).toLocaleString('ru-RU')}
                          </div>
                        </div>
                        <div className="font-semibold text-gray-900">
                          {item.status === 'succeeded'
                            ? formatMoney(item.charged || 0)
                            : 'Без списания'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {aiAnalysisProvider !== 'artistcrm' ? (
                <InstructionButton
                  onClick={() =>
                    modalsFunc.add({
                      title: 'Как подключить ИИ-провайдера',
                      showDecline: true,
                      declineButtonName: 'Закрыть',
                      Children: AIProviderGuide,
                    })
                  }
                >
                  Как подключить
                </InstructionButton>
              ) : null}
            </div>
          </IntegrationAccordion>
        ) : null}
        {!canUseCalendar &&
        !canUseTelephony &&
        !canUseAi &&
        !canUseAvito &&
        !canUseVk &&
        !canUseTelegram ? (
          <Notice tone="warning" className="shrink-0 rounded px-4 py-3">
            Google Calendar, Avito, VK, Telegram, IP-телефония и
            AI-интеграции доступны только на тарифах с соответствующими
            опциями.
          </Notice>
        ) : null}
      </div>
    </div>
  )
}

export default IntegrationsContent
