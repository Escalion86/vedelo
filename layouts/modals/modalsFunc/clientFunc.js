import ErrorsList from '@components/ErrorsList'
import DateInput from '@components/DateInput'
import FormWrapper from '@components/FormWrapper'
import CheckBox from '@components/CheckBox'
import DocumentsEditor from '@components/DocumentsEditor'
import Input from '@components/Input'
import InputWrapper from '@components/InputWrapper'
import LabeledContainer from '@components/LabeledContainer'
import Notice from '@components/Notice'
import PhoneInput from '@components/PhoneInput'
import Textarea from '@components/Textarea'
import { CLIENT_TYPES, DEFAULT_CLIENT } from '@helpers/constants'
import { getCustomValue } from '@helpers/customSettings'
import getPersonFullName from '@helpers/getPersonFullName'
import {
  isValidMaxContact,
  normalizeMaxContactInput,
} from '@helpers/maxContact'
import { faChevronDown } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  normalizeInstagramInput,
  normalizeTelegramInput,
  normalizeVkInput,
} from '@helpers/socialInput'
import useErrors from '@helpers/useErrors'
import { getUserTariffAccess } from '@helpers/tariffAccess'
import itemsFuncAtom from '@state/atoms/itemsFuncAtom'
import { modalsFuncAtom } from '@state/atoms'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import tariffsAtom from '@state/atoms/tariffsAtom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { useClientQuery, useClientsQuery } from '@helpers/useClientsQuery'

const CONTACT_CHANNELS = [
  { value: 'phone', name: 'Телефон' },
  { value: 'telegram', name: 'Telegram' },
  { value: 'whatsapp', name: 'WhatsApp' },
  { value: 'max', name: 'MAX' },
  { value: 'vk', name: 'VK' },
  { value: 'other', name: 'Другое' },
]

const createSignificantDate = () => ({
  title: '',
  date: null,
  comment: '',
})

const normalizeSignificantDates = (items) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      title: String(item?.title ?? '').trim(),
      date: item?.date || null,
      comment: String(item?.comment ?? '').trim(),
    }))
    .filter((item) => item.title || item.date || item.comment)

const getRequisitesSummary = ({
  legalName,
  inn,
  kpp,
  ogrn,
  bankName,
  bik,
  checkingAccount,
  correspondentAccount,
  legalAddress,
}) => {
  const items = [
    { label: 'Наименование', value: legalName },
    { label: 'ИНН', value: inn },
    { label: 'КПП', value: kpp },
    { label: 'ОГРН', value: ogrn },
    { label: 'Банк', value: bankName },
    { label: 'БИК', value: bik },
    { label: 'Р/с', value: checkingAccount },
    { label: 'К/с', value: correspondentAccount },
    { label: 'Адрес', value: legalAddress },
  ]
    .map((item) => ({
      ...item,
      value: String(item.value ?? '').trim(),
    }))
    .filter((item) => item.value)

  if (!items.length) return 'Реквизиты не заполнены'

  const visibleItems = items.slice(0, 3)
  const summary = visibleItems
    .map((item) => `${item.label}: ${item.value}`)
    .join(', ')
  const hiddenCount = items.length - visibleItems.length

  return hiddenCount > 0 ? `${summary} +${hiddenCount}` : summary
}

const clientFunc = (clientId, clone = false, onSuccess, options = {}) => {
  const ClientModal = ({
    closeModal,
    setOnConfirmFunc,
    setOnDeclineFunc,
    setOnShowOnCloseConfirmDialog,
    setDisableConfirm,
    setDisableDecline,
  }) => {
    const { data: clients = [] } = useClientsQuery()
    const initialClient = useMemo(
      () => clients.find((item) => item._id === clientId) ?? null,
      [clients]
    )
    const { data: client = initialClient } = useClientQuery(
      clientId,
      initialClient
    )
    const setClient = useAtomValue(itemsFuncAtom).client.set
    const modalsFunc = useAtomValue(modalsFuncAtom)
    const loggedUser = useAtomValue(loggedUserAtom)
    const siteSettings = useAtomValue(siteSettingsAtom)
    const tariffs = useAtomValue(tariffsAtom)

    const [fullName, setFullName] = useState(
      getPersonFullName(client ?? DEFAULT_CLIENT)
    )
    const [phone, setPhone] = useState(
      client?.phone ?? options?.initialPhone ?? DEFAULT_CLIENT.phone
    )
    const [whatsapp, setWhatsapp] = useState(
      client?.whatsapp ?? DEFAULT_CLIENT.whatsapp
    )
    const [telegram, setTelegram] = useState(
      client?.telegram ?? DEFAULT_CLIENT.telegram
    )
    const [instagram, setInstagram] = useState(
      client?.instagram ?? DEFAULT_CLIENT.instagram
    )
    const [vk, setVk] = useState(client?.vk ?? DEFAULT_CLIENT.vk)
    const [max, setMax] = useState(client?.max ?? DEFAULT_CLIENT.max)
    const [preferredContactChannel, setPreferredContactChannel] = useState(
      client?.preferredContactChannel ?? DEFAULT_CLIENT.preferredContactChannel
    )
    const [preferredContactChannelOther, setPreferredContactChannelOther] =
      useState(
        client?.preferredContactChannelOther ??
          DEFAULT_CLIENT.preferredContactChannelOther
      )
    const [messengerPushMuted, setMessengerPushMuted] = useState(
      client?.messengerPushMuted ?? DEFAULT_CLIENT.messengerPushMuted
    )
    const [comment, setComment] = useState(
      client?.comment ?? DEFAULT_CLIENT.comment
    )
    const [significantDates, setSignificantDates] = useState(() =>
      normalizeSignificantDates(
        client?.significantDates ?? DEFAULT_CLIENT.significantDates
      )
    )
    const [clientType, setClientType] = useState(
      client?.clientType ?? DEFAULT_CLIENT.clientType
    )
    const [legalName, setLegalName] = useState(
      client?.legalName ?? DEFAULT_CLIENT.legalName
    )
    const [inn, setInn] = useState(client?.inn ?? DEFAULT_CLIENT.inn)
    const [kpp, setKpp] = useState(client?.kpp ?? DEFAULT_CLIENT.kpp)
    const [ogrn, setOgrn] = useState(client?.ogrn ?? DEFAULT_CLIENT.ogrn)
    const [bankName, setBankName] = useState(
      client?.bankName ?? DEFAULT_CLIENT.bankName
    )
    const [bik, setBik] = useState(client?.bik ?? DEFAULT_CLIENT.bik)
    const [checkingAccount, setCheckingAccount] = useState(
      client?.checkingAccount ?? DEFAULT_CLIENT.checkingAccount
    )
    const [correspondentAccount, setCorrespondentAccount] = useState(
      client?.correspondentAccount ?? DEFAULT_CLIENT.correspondentAccount
    )
    const [legalAddress, setLegalAddress] = useState(
      client?.legalAddress ?? DEFAULT_CLIENT.legalAddress
    )
    const [isRequisitesCollapsed, setIsRequisitesCollapsed] = useState(true)
    const [errors, checkErrors, addError, removeError] = useErrors()

    const requisitesSummary = useMemo(
      () =>
        getRequisitesSummary({
          legalName,
          inn,
          kpp,
          ogrn,
          bankName,
          bik,
          checkingAccount,
          correspondentAccount,
          legalAddress,
        }),
      [
        legalName,
        inn,
        kpp,
        ogrn,
        bankName,
        bik,
        checkingAccount,
        correspondentAccount,
        legalAddress,
      ]
    )

    const enabledMessengerIntegrations = useMemo(() => {
      const custom = siteSettings?.custom ?? {}
      return [
        getCustomValue(custom, 'telegramBusinessEnabled') === true &&
          'Telegram',
        getCustomValue(custom, 'avitoEnabled') === true && 'Avito',
        getCustomValue(custom, 'vkGroupEnabled') === true && 'VK',
      ].filter(Boolean)
    }, [siteSettings?.custom])

    const showMessengerNotificationSettings =
      enabledMessengerIntegrations.length > 0
    const canUseDocuments = getUserTariffAccess(
      loggedUser,
      tariffs
    )?.allowDocuments

    const updateClientDocuments = useCallback(
      async (documents) => {
        if (!client?._id) return
        await setClient({ ...client, documents })
      },
      [client, setClient]
    )

    const normalizePhoneValue = useCallback((value) => {
      if (!value) return null
      const digits = String(value).replace(/[^\d]/g, '')
      if (digits.length < 11) return null
      const normalized = digits.slice(0, 11)
      if (normalized.startsWith('8')) return `7${normalized.slice(1)}`
      if (normalized.startsWith('7')) return normalized
      return null
    }, [])

    const isFormChanged = useMemo(
      () =>
        getPersonFullName(client ?? DEFAULT_CLIENT) !== fullName ||
        (client?.phone ?? DEFAULT_CLIENT.phone) !== phone ||
        (client?.whatsapp ?? DEFAULT_CLIENT.whatsapp) !== whatsapp ||
        (client?.telegram ?? DEFAULT_CLIENT.telegram) !== telegram ||
        (client?.instagram ?? DEFAULT_CLIENT.instagram) !== instagram ||
        (client?.vk ?? DEFAULT_CLIENT.vk) !== vk ||
        (client?.max ?? DEFAULT_CLIENT.max) !== max ||
        (client?.preferredContactChannel ??
          DEFAULT_CLIENT.preferredContactChannel) !== preferredContactChannel ||
        (client?.preferredContactChannelOther ??
          DEFAULT_CLIENT.preferredContactChannelOther) !==
          preferredContactChannelOther ||
        (client?.messengerPushMuted ?? DEFAULT_CLIENT.messengerPushMuted) !==
          messengerPushMuted ||
        (client?.comment ?? DEFAULT_CLIENT.comment) !== comment ||
        JSON.stringify(
          normalizeSignificantDates(
            client?.significantDates ?? DEFAULT_CLIENT.significantDates
          )
        ) !== JSON.stringify(normalizeSignificantDates(significantDates)) ||
        (client?.clientType ?? DEFAULT_CLIENT.clientType) !== clientType ||
        (client?.legalName ?? DEFAULT_CLIENT.legalName) !== legalName ||
        (client?.inn ?? DEFAULT_CLIENT.inn) !== inn ||
        (client?.kpp ?? DEFAULT_CLIENT.kpp) !== kpp ||
        (client?.ogrn ?? DEFAULT_CLIENT.ogrn) !== ogrn ||
        (client?.bankName ?? DEFAULT_CLIENT.bankName) !== bankName ||
        (client?.bik ?? DEFAULT_CLIENT.bik) !== bik ||
        (client?.checkingAccount ?? DEFAULT_CLIENT.checkingAccount) !==
          checkingAccount ||
        (client?.correspondentAccount ??
          DEFAULT_CLIENT.correspondentAccount) !== correspondentAccount ||
        (client?.legalAddress ?? DEFAULT_CLIENT.legalAddress) !== legalAddress,
      [
        client,
        fullName,
        phone,
        whatsapp,
        telegram,
        instagram,
        vk,
        max,
        preferredContactChannel,
        preferredContactChannelOther,
        messengerPushMuted,
        comment,
        significantDates,
        clientType,
        legalName,
        inn,
        kpp,
        ogrn,
        bankName,
        bik,
        checkingAccount,
        correspondentAccount,
        legalAddress,
      ]
    )

    const onClickConfirm = useCallback(async () => {
      const hasContactValidationError = checkErrors({
        phoneNoRequired: phone,
        whatsapp,
      })
      let customError = false
      if (!fullName || !fullName.trim()) {
        addError({ firstName: 'Укажите ФИО' })
        customError = true
      }
      if (!isValidMaxContact(max)) {
        addError({
          max: 'Укажите ссылку max.ru на контакт или российский номер телефона',
        })
        customError = true
      }
      const hasAnyContact =
        Boolean(normalizePhoneValue(phone)) ||
        Boolean(normalizePhoneValue(whatsapp)) ||
        Boolean(String(client?.email || '').trim()) ||
        Boolean(String(telegram || '').trim()) ||
        Boolean(String(instagram || '').trim()) ||
        Boolean(String(vk || '').trim()) ||
        Boolean(String(max || '').trim())
      if (!hasAnyContact) {
        addError({
          phone:
            'Укажите хотя бы один контакт: телефон, WhatsApp, email, Telegram, Instagram, VK или MAX',
        })
        customError = true
      }
      if (!hasContactValidationError && !customError) {
        const normalizedPhone = normalizePhoneValue(phone)
        if (normalizedPhone) {
          const existedClient = clients.find(
            (item) =>
              item?.phone &&
              normalizePhoneValue(item.phone) === normalizedPhone &&
              item._id !== client?._id
          )
          if (existedClient) {
            const existingName = getPersonFullName(existedClient, {
              fallback: 'Без имени',
            })
            if (typeof onSuccess === 'function') {
              modalsFunc.add({
                title: 'Клиент уже существует',
                text: `Клиент с таким номером телефона уже существует: ${existingName}.\n\nВы можете выбрать существующего клиента.`,
                confirmButtonName: 'Выбрать клиента',
                declineButtonName: 'Закрыть',
                onConfirm: () => {
                  onSuccess(existedClient)
                  closeModal()
                },
              })
            } else {
              modalsFunc.add({
                title: 'Клиент уже существует',
                text: `Клиент с таким номером телефона уже существует: ${existingName}.\n\nСоздать клиента с этим номером нельзя.`,
                confirmButtonName: 'Понятно',
                onConfirm: true,
                showDecline: false,
              })
            }
            return
          }
        }
        const result = await setClient(
          {
            _id: client?._id,
            firstName: fullName.trim(),
            secondName: '',
            thirdName: '',
            phone: phone ?? null,
            whatsapp: whatsapp ?? null,
            telegram: telegram.trim(),
            instagram: instagram.trim(),
            vk: vk.trim(),
            max: normalizeMaxContactInput(max),
            preferredContactChannel,
            preferredContactChannelOther:
              preferredContactChannel === 'other'
                ? preferredContactChannelOther.trim()
                : '',
            messengerPushMuted,
            comment: comment.trim(),
            significantDates: normalizeSignificantDates(significantDates),
            clientType,
            legalName: legalName.trim(),
            inn: inn.trim(),
            kpp: kpp.trim(),
            ogrn: ogrn.trim(),
            bankName: bankName.trim(),
            bik: bik.trim(),
            checkingAccount: checkingAccount.trim(),
            correspondentAccount: correspondentAccount.trim(),
            legalAddress: legalAddress.trim(),
          },
          clone
        )
        if (result && typeof onSuccess === 'function') onSuccess(result)
        closeModal()
      }
    }, [
      addError,
      checkErrors,
      client?._id,
      client?.email,
      closeModal,
      fullName,
      phone,
      whatsapp,
      telegram,
      instagram,
      vk,
      max,
      preferredContactChannel,
      preferredContactChannelOther,
      messengerPushMuted,
      comment,
      significantDates,
      setClient,
      clientType,
      clients,
      modalsFunc,
      normalizePhoneValue,
      legalName,
      inn,
      kpp,
      ogrn,
      bankName,
      bik,
      checkingAccount,
      correspondentAccount,
      legalAddress,
    ])

    const onClickConfirmRef = useRef(onClickConfirm)

    useEffect(() => {
      onClickConfirmRef.current = onClickConfirm
    }, [onClickConfirm])

    const handleCheckPhone = () => {
      removeError('phone')
      const normalizedPhone = normalizePhoneValue(phone)
      if (!normalizedPhone) {
        addError({ phone: 'Укажите корректный номер телефона' })
        return
      }

      const existingClient = clients.find(
        (item) =>
          item?.phone &&
          normalizePhoneValue(item.phone) === normalizedPhone &&
          item._id !== client?._id
      )

      if (!existingClient) {
        addError({ phone: 'Клиент с таким номером не найден' })
        return
      }

      if (typeof onSuccess === 'function') {
        const confirmed = window.confirm(
          `Найден клиент: ${getPersonFullName(existingClient, {
            fallback: 'Без имени',
          })}. Выбрать его?`
        )
        if (confirmed) {
          onSuccess(existingClient)
          closeModal()
        }
        return
      }

      addError({ phone: 'Клиент с таким номером уже существует' })
    }

    const updateSignificantDate = (index, patch) => {
      setSignificantDates((prev) =>
        prev.map((item, itemIndex) =>
          itemIndex === index ? { ...item, ...patch } : item
        )
      )
    }

    const addSignificantDate = () => {
      setSignificantDates((prev) => [...prev, createSignificantDate()])
    }

    const removeSignificantDate = (index) => {
      setSignificantDates((prev) =>
        prev.filter((item, itemIndex) => itemIndex !== index)
      )
    }

    useEffect(() => {
      setOnShowOnCloseConfirmDialog(isFormChanged)
      setDisableConfirm(!isFormChanged)
      setOnConfirmFunc(
        isFormChanged ? () => onClickConfirmRef.current() : undefined
      )
    }, [
      setDisableConfirm,
      setOnConfirmFunc,
      setOnShowOnCloseConfirmDialog,
      isFormChanged,
    ])

    return (
      <FormWrapper>
        <Input
          label="ФИО"
          value={fullName}
          onChange={(value) => {
            removeError('firstName')
            setFullName(value)
          }}
          required
          error={errors.firstName}
        />
        <div className="mt-3 flex items-end gap-2">
          <PhoneInput
            label="Телефон"
            value={phone}
            onChange={(value) => {
              removeError('phone')
              setPhone(value)
            }}
            error={errors.phone}
            className="w-full"
            noMargin
            copyPasteButtons
          />
          <button
            type="button"
            className="mb-1 cursor-pointer rounded border border-gray-300 px-3 py-2 text-sm font-semibold whitespace-nowrap text-gray-700 transition hover:bg-gray-50"
            onClick={handleCheckPhone}
          >
            Проверить
          </button>
        </div>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <PhoneInput
            label="Whatsapp"
            value={whatsapp}
            onChange={(value) => {
              removeError('phone')
              removeError('whatsapp')
              setWhatsapp(value)
            }}
            error={errors.whatsapp}
            className="w-full"
            smallMargin
            copyPasteButtons
          />
          <Input
            label="Telegram"
            value={telegram}
            onChange={(value) => {
              removeError('phone')
              setTelegram(value)
            }}
            className="w-full"
            smallMargin
            copyPasteButtons
            normalizePastedValue={normalizeTelegramInput}
          />
          <Input
            label="Instagram"
            value={instagram}
            onChange={(value) => {
              removeError('phone')
              setInstagram(value)
            }}
            className="w-full"
            smallMargin
            copyPasteButtons
            normalizePastedValue={normalizeInstagramInput}
          />
          <Input
            label="VK"
            value={vk}
            onChange={(value) => {
              removeError('phone')
              setVk(value)
            }}
            className="w-full"
            smallMargin
            copyPasteButtons
            normalizePastedValue={normalizeVkInput}
          />
          <Input
            label="MAX"
            value={max}
            onChange={(value) => {
              removeError('phone')
              removeError('max')
              setMax(value)
            }}
            error={errors.max}
            showErrorText
            className="w-full"
            smallMargin
            copyPasteButtons
            normalizePastedValue={normalizeMaxContactInput}
            placeholder="Ссылка max.ru или +7 999 123-45-67"
            maxLength={500}
          />
        </div>
        <InputWrapper label="Тип клиента" paddingY fitWidth>
          <div className="flex flex-wrap gap-2">
            {CLIENT_TYPES.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`rounded border px-3 py-2 text-sm font-semibold transition ${
                  clientType === item.value
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => setClientType(item.value)}
              >
                {item.name}
              </button>
            ))}
          </div>
        </InputWrapper>
        <InputWrapper label="Приоритетный канал связи" paddingY fitWidth>
          <div className="flex flex-wrap gap-2">
            {CONTACT_CHANNELS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`cursor-pointer rounded border px-3 py-2 text-sm font-semibold transition ${
                  preferredContactChannel === item.value
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => setPreferredContactChannel(item.value)}
              >
                {item.name}
              </button>
            ))}
          </div>
        </InputWrapper>
        {preferredContactChannel === 'other' && (
          <Input
            label="Другой канал связи"
            value={preferredContactChannelOther}
            onChange={setPreferredContactChannelOther}
            maxLength={100}
          />
        )}
        {showMessengerNotificationSettings && (
          <InputWrapper label="Уведомления из мессенджеров" paddingY fitWidth>
            <CheckBox
              checked={messengerPushMuted}
              onClick={() => setMessengerPushMuted((value) => !value)}
              label={
                <span>
                  Не присылать push по входящим сообщениям этого клиента
                  <span className="mt-1 block text-sm leading-5 text-gray-500">
                    Включено для:{' '}
                    {enabledMessengerIntegrations.join(', ')}. Сообщения
                    останутся в переписке и в «Важном».
                  </span>
                </span>
              }
              noMargin
              wrapperClassName="items-start"
              labelClassName="text-sm text-gray-700"
            />
          </InputWrapper>
        )}
        <Textarea
          label="Комментарий"
          value={comment}
          onChange={(value) => setComment(value.slice(0, 2000))}
          rows={3}
          inputClassName="min-h-20 resize-y bg-transparent"
        />
        {client?._id && !clone ? (
          <div className="border-input mt-3.5 mb-1 rounded border-2 bg-white p-3">
            {canUseDocuments ? (
              <DocumentsEditor
                documents={client.documents ?? []}
                onChange={updateClientDocuments}
                entityType="clients"
                entityId={client._id}
                entityLabel="клиента"
                maxVisible={3}
                noMargin
              />
            ) : (
              <Notice tone="warning" className="rounded-md">
                Файлы и документы недоступны на текущем тарифе.
              </Notice>
            )}
          </div>
        ) : null}
        <LabeledContainer label="Значимые даты">
          <div className="flex flex-col gap-3">
            {significantDates.map((item, index) => (
              <div
                key={index}
                className="rounded border border-gray-200 bg-gray-50 p-3"
              >
                <div className="grid gap-0 sm:grid-cols-[1fr_auto] sm:gap-3">
                  <Input
                    label="Название"
                    value={item.title}
                    onChange={(value) =>
                      updateSignificantDate(index, {
                        title: value.slice(0, 100),
                      })
                    }
                    className="w-full"
                    smallMargin
                  />
                  <DateInput
                    label="Дата"
                    value={item.date}
                    onChange={(value) =>
                      updateSignificantDate(index, { date: value })
                    }
                    className="w-full sm:w-48"
                    smallMargin
                  />
                </div>
                <Textarea
                  label="Комментарий"
                  value={item.comment}
                  onChange={(value) =>
                    updateSignificantDate(index, {
                      comment: value.slice(0, 500),
                    })
                  }
                  rows={2}
                  smallMargin
                  inputClassName="min-h-16 resize-y bg-transparent"
                />
                <button
                  type="button"
                  className="mt-2 cursor-pointer rounded border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-white"
                  onClick={() => removeSignificantDate(index)}
                >
                  Удалить дату
                </button>
              </div>
            ))}
            <button
              type="button"
              className="w-fit cursor-pointer rounded border border-emerald-500 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
              onClick={addSignificantDate}
            >
              Добавить дату
            </button>
          </div>
        </LabeledContainer>
        <div className="border-input mt-3.5 mb-1 overflow-hidden rounded border-2 bg-white">
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition hover:bg-gray-50"
            onClick={() => setIsRequisitesCollapsed((value) => !value)}
            aria-expanded={!isRequisitesCollapsed}
          >
            <div className="min-w-0 flex-1">
              <div className="text-general text-sm font-semibold">
                Реквизиты для договора
              </div>
              {isRequisitesCollapsed && (
                <div className="mt-0.5 truncate text-sm text-gray-500">
                  {requisitesSummary}
                </div>
              )}
            </div>
            <FontAwesomeIcon
              icon={faChevronDown}
              className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${
                isRequisitesCollapsed ? '' : 'rotate-180'
              }`}
            />
          </button>
          {!isRequisitesCollapsed && (
            <div className="border-t border-gray-100 px-2 pb-2">
              <div className="grid gap-x-3 sm:grid-cols-2">
                <Input
                  label="Наименование / ФИО"
                  value={legalName}
                  onChange={setLegalName}
                  className="w-full"
                  smallMargin
                />
                <Input
                  label="ИНН"
                  value={inn}
                  onChange={setInn}
                  className="w-full"
                  smallMargin
                />
                <Input
                  label="КПП"
                  value={kpp}
                  onChange={setKpp}
                  className="w-full"
                  smallMargin
                />
                <Input
                  label="ОГРН / ОГРНИП"
                  value={ogrn}
                  onChange={setOgrn}
                  className="w-full"
                  smallMargin
                />
                <Input
                  label="Банк"
                  value={bankName}
                  onChange={setBankName}
                  className="w-full"
                  smallMargin
                />
                <Input
                  label="БИК"
                  value={bik}
                  onChange={setBik}
                  className="w-full"
                  smallMargin
                />
                <Input
                  label="Расчетный счет"
                  value={checkingAccount}
                  onChange={setCheckingAccount}
                  className="w-full"
                  smallMargin
                />
                <Input
                  label="Корр. счет"
                  value={correspondentAccount}
                  onChange={setCorrespondentAccount}
                  className="w-full"
                  smallMargin
                />
                <Input
                  label="Юридический адрес"
                  value={legalAddress}
                  onChange={setLegalAddress}
                  className="w-full sm:col-span-2"
                  smallMargin
                />
              </div>
            </div>
          )}
        </div>
        <ErrorsList errors={errors} />
      </FormWrapper>
    )
  }

  return {
    title: `${clientId && !clone ? 'Редактирование' : 'Создание'} клиента`,
    confirmButtonName: clientId && !clone ? 'Применить' : 'Создать',
    Children: ClientModal,
  }
}

export default clientFunc
