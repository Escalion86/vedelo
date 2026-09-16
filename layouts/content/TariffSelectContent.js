'use client'

import { useEffect, useMemo, useState } from 'react'
import ContentHeader from '@components/ContentHeader'
import Button from '@components/Button'
import EmptyState from '@components/EmptyState'
import IconCheckBox from '@components/IconCheckBox'
import SectionCard from '@components/SectionCard'
import tariffsAtom from '@state/atoms/tariffsAtom'
import { PRIMARY_WEB_BILLING_PROVIDER } from '@helpers/billingProviders.mjs'
import { isRegistrationOfferTariff } from '@helpers/tariffAccess'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import itemsFuncAtom from '@state/atoms/itemsFuncAtom'
import loggedUserActiveRoleSelector from '@state/selectors/loggedUserActiveRoleSelector'
import modalsFuncAtom from '@state/atoms/modalsFuncAtom'
import { useAtom, useAtomValue } from 'jotai'
import { useRouter } from 'next/navigation'
import useSnackbar from '@helpers/useSnackbar'
import { reachGoal } from '@helpers/metrikaGoals'
import useWorkItemTerminology from '@helpers/useWorkItemTerminology'

const formatPrice = (price) => {
  if (!price || Number(price) === 0) return 'Бесплатно'
  return `${Number(price).toLocaleString('ru-RU')} ₽/мес`
}

const formatEventsLimit = (limit, terms) => {
  if (!Number.isFinite(limit) || Number(limit) === 0) {
    return `Без ограничений по ${terms.pluralDative}`
  }
  return `До ${limit} ${terms.pluralGenitive} в месяц`
}

const TariffSelectContent = () => {
  const router = useRouter()
  const snackbar = useSnackbar()
  const [loggedUser, setLoggedUser] = useAtom(loggedUserAtom)
  const itemsFunc = useAtomValue(itemsFuncAtom)
  const tariffs = useAtomValue(tariffsAtom)
  const loggedUserActiveRole = useAtomValue(loggedUserActiveRoleSelector)
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const [isSaving, setIsSaving] = useState(false)
  const terms = useWorkItemTerminology()

  useEffect(() => {
    reachGoal('tariff_page_open')
  }, [])

  const addMonths = (date, count) => {
    const next = new Date(date)
    const day = next.getDate()
    next.setMonth(next.getMonth() + count)
    if (next.getDate() < day) {
      next.setDate(0)
    }
    return next
  }

  const publicTariffs = useMemo(
    () =>
      tariffs
        .filter((tariff) => !tariff?.hidden)
        .sort((a, b) => {
          const priceDiff = (a.price ?? 0) - (b.price ?? 0)
          if (priceDiff !== 0) return priceDiff
          return (a.title || '').localeCompare(b.title || '', 'ru')
        }),
    [tariffs]
  )

  const handleSelectConfirmed = async (tariffId) => {
    if (!loggedUser?._id) return
    setIsSaving(true)
    const updated = await itemsFunc.user.set({
      _id: loggedUser._id,
      tariffId,
    })
    if (updated?._id) {
      setLoggedUser(updated)
      router.push('/cabinet/eventsUpcoming')
    } else {
      const message = 'Не удалось выбрать тариф'
      snackbar.error(message)
      modalsFunc.add({
        title: 'Ошибка',
        text: message,
        confirmButtonName: 'Понятно',
        onConfirm: true,
        showDecline: false,
      })
    }
    setIsSaving(false)
  }

  const handleTariffPayment = async ({ tariffId, amount }) => {
    if (!tariffId) return
    setIsSaving(true)
    try {
      const response = await fetch(
        `/api/billing/${PRIMARY_WEB_BILLING_PROVIDER.id}/create`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            purpose: 'tariff',
            tariffId,
            amount,
          }),
        }
      )
      const payload = await response.json().catch(() => ({}))
      const confirmationUrl = payload?.data?.confirmationUrl
      if (!response.ok || !payload?.success || !confirmationUrl) {
        snackbar.error(payload?.error || 'Не удалось создать платеж')
        return
      }
      window.location.href = confirmationUrl
    } finally {
      setIsSaving(false)
    }
  }

  const handleSelect = async (tariffId) => {
    if (!loggedUser?._id) return
    const selectedTariff = tariffs.find(
      (item) => String(item?._id) === String(tariffId)
    )
    const currentTariff = tariffs.find(
      (item) => String(item?._id) === String(loggedUser?.tariffId)
    )
    const price = Number(selectedTariff?.price ?? 0)
    const currentPrice = Number(currentTariff?.price ?? 0)
    const balance = Number(loggedUser?.balance ?? 0)
    const hasPaidTariff = Number.isFinite(currentPrice) && currentPrice > 0
    const isTargetFree = !Number.isFinite(price) || price <= 0
    const isTargetPaid = Number.isFinite(price) && price > 0
    if (isTargetPaid) {
      reachGoal('payment_intent', {
        tariffId,
        price,
        balance,
      })
    }
    const now = new Date()
    const activeUntil = loggedUser?.tariffActiveUntil
      ? new Date(loggedUser.tariffActiveUntil)
      : null
    const isActivePaidTariff =
      hasPaidTariff &&
      !isRegistrationOfferTariff(loggedUser) &&
      activeUntil &&
      !Number.isNaN(activeUntil.getTime()) &&
      activeUntil.getTime() > now.getTime()

    if (isActivePaidTariff && isTargetFree) {
      modalsFunc.add({
        title: 'Тариф уже оплачен',
        text: 'У вас уже действует оплаченный тариф. Если не оплачивать его продление, после окончания срока он автоматически перейдет на бесплатный.',
        confirmButtonName: 'Понятно',
        onConfirm: true,
        showDecline: false,
      })
      return
    }

    let creditAmount = 0
    if (isActivePaidTariff) {
      const periodStart = addMonths(activeUntil, -1)
      const periodMs = activeUntil.getTime() - periodStart.getTime()
      const remainingMs = activeUntil.getTime() - now.getTime()
      if (periodMs > 0 && remainingMs > 0) {
        creditAmount = Math.floor((currentPrice * remainingMs) / periodMs)
      }
    }
    const availableBalance =
      (Number.isFinite(balance) ? balance : 0) + creditAmount
    const netCharge = Math.max(price - creditAmount, 0)

    if (isTargetPaid) {
      if (!Number.isFinite(availableBalance) || availableBalance < price) {
        const missing = Math.max(price - availableBalance, 0)
        modalsFunc.add({
          title: 'Недостаточно средств',
          text: `Недостаточно средств для смены тарифа. Не хватает ${missing.toLocaleString(
            'ru-RU'
          )} руб.`,
          confirmButtonName: 'Понятно',
          onConfirm: true,
          showDecline: false,
          bottomLeftButtonProps: {
            name: PRIMARY_WEB_BILLING_PROVIDER.paymentButtonLabel,
            classBgColor: 'bg-general',
            className: 'modal-action-button',
            onClick: () =>
              handleTariffPayment({
                tariffId,
                amount: missing,
              }),
          },
        })
        return
      }

      if (isActivePaidTariff) {
        modalsFunc.add({
          title: 'Смена тарифа',
          text: `Компенсация за текущий тариф: ${creditAmount.toLocaleString(
            'ru-RU'
          )} руб. Со счета будет списано ${netCharge.toLocaleString(
            'ru-RU'
          )} руб для перехода на тариф "${selectedTariff?.title ?? 'Тариф'}".`,
          confirmButtonName: 'Продолжить',
          onConfirm: () => handleSelectConfirmed(tariffId),
          showDecline: true,
        })
        return
      }

      modalsFunc.add({
        title: 'Смена тарифа',
        text: `Со счета будет списано ${price.toLocaleString(
          'ru-RU'
        )} руб для перехода на тариф "${selectedTariff?.title ?? 'Тариф'}".`,
        confirmButtonName: 'Продолжить',
        onConfirm: () => handleSelectConfirmed(tariffId),
        showDecline: true,
      })
      return
    }

    return handleSelectConfirmed(tariffId)
  }

  const isAdmin = loggedUserActiveRole?.dev || loggedUserActiveRole?.users?.setRole

  return (
    <div className="flex h-full flex-col gap-4">
      <ContentHeader>
        <div className="text-sm font-semibold text-gray-700">
          Баланс:{' '}
          {Number(loggedUser?.balance ?? 0).toLocaleString('ru-RU')} ₽
        </div>
        <Button
          name="История операций"
          className="h-9 px-4 text-sm"
          onClick={() => router.push('/cabinet/billing-history')}
        />
      </ContentHeader>
      <SectionCard className="min-h-0 flex-1 overflow-auto p-4">
        {publicTariffs.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {publicTariffs.map((tariff) => (
              <div
                key={tariff._id}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-gray-900">
                      {tariff.title || 'Тариф'}
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      {formatEventsLimit(tariff.eventsPerMonth, terms)}
                    </div>
                  </div>
                  <div className="text-lg font-semibold text-gray-900">
                    {formatPrice(tariff.price)}
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
                  <IconCheckBox
                    checked={tariff.allowCalendarSync}
                    label="Синхронизация с календарем"
                    readOnly
                    noMargin
                  />
                  <IconCheckBox
                    checked={tariff.allowStatistics}
                    label="Просмотр статистики"
                    readOnly
                    noMargin
                  />
                  <IconCheckBox
                    checked={tariff.allowDocuments}
                    label="Работа с документами"
                    readOnly
                    noMargin
                  />
                  <IconCheckBox
                    checked={tariff.allowTelephony}
                    label="IP-телефония"
                    readOnly
                    noMargin
                  />
                  <IconCheckBox
                    checked={tariff.allowAi}
                    label="ИИ-возможности"
                    readOnly
                    noMargin
                  />
                  <IconCheckBox
                    checked={tariff.allowProposals ?? tariff.allowDocuments}
                    label="Коммерческие предложения"
                    readOnly
                    noMargin
                  />
                  <IconCheckBox
                    checked={tariff.allowAvitoIntegration}
                    label="Интеграция Avito"
                    readOnly
                    noMargin
                  />
                  <IconCheckBox
                    checked={tariff.allowVkIntegration}
                    label="Интеграция VK"
                    readOnly
                    noMargin
                  />
                  <IconCheckBox
                    checked={tariff.allowTelegramIntegration}
                    label="Интеграция Telegram"
                    readOnly
                    noMargin
                  />
                  <IconCheckBox
                    checked={tariff.allowPublicLeadApi}
                    label="Подключение сайта по API"
                    readOnly
                    noMargin
                  />
                </div>
                <div className="mt-4 flex items-center justify-between">
                  {loggedUser?.tariffId === tariff._id && (
                    <span className="text-xs font-semibold text-general">
                      Текущий тариф
                    </span>
                  )}
                  {loggedUser?.tariffId !== tariff._id && (
                    <Button
                      name="Выбрать тариф"
                      className="h-9 px-4 text-sm"
                      disabled={isSaving}
                      loading={isSaving}
                      onClick={() => handleSelect(tariff._id)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState bordered={false}>
            <div className="flex flex-col items-center gap-3">
              <div>Нет доступных тарифов.</div>
              {isAdmin && (
                <Button
                  name="Настроить тарифы"
                  className="h-9 px-4 text-sm"
                  onClick={() => router.push('/cabinet/tariffs')}
                />
              )}
            </div>
          </EmptyState>
        )}
      </SectionCard>
    </div>
  )
}

export default TariffSelectContent
