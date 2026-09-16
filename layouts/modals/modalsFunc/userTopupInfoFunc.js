/* eslint-disable react-hooks/exhaustive-deps */
import Button from '@components/Button'
import FormWrapper from '@components/FormWrapper'
import Input from '@components/Input'
import Notice from '@components/Notice'
import UserName from '@components/UserName'
import {
  PRIMARY_WEB_BILLING_PROVIDER,
  getVisibleWebBillingProviders,
} from '@helpers/billingProviders.mjs'
import useSnackbar from '@helpers/useSnackbar'
import loggedUserActiveRoleSelector from '@state/selectors/loggedUserActiveRoleSelector'
import userSelector from '@state/selectors/userSelector'
import { useEffect, useMemo, useState } from 'react'
import { useAtomValue } from 'jotai'

const SBP_BONUS_RATE = 0.02

const userTopupInfoFunc = (userId) => {
  const UserTopupInfoModal = ({ closeModal }) => {
    const user = useAtomValue(userSelector(userId))
    const loggedUserActiveRole = useAtomValue(loggedUserActiveRoleSelector)
    const snackbar = useSnackbar()
    const [amount, setAmount] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [billingConfig, setBillingConfig] = useState({
      sbpBonusEnabled: false,
      sbpBonusRate: SBP_BONUS_RATE,
    })

    useEffect(() => {
      if (!user) closeModal()
    }, [user])

    useEffect(() => {
      let cancelled = false
      fetch('/api/billing/config')
        .then((response) => response.json())
        .then((payload) => {
          if (cancelled) return
          setBillingConfig({
            sbpBonusEnabled: payload?.data?.sbpBonusEnabled === true,
            sbpBonusRate:
              Number(payload?.data?.sbpBonusRate) > 0
                ? Number(payload.data.sbpBonusRate)
                : SBP_BONUS_RATE,
          })
        })
        .catch(() => null)
      return () => {
        cancelled = true
      }
    }, [])

    const amountValue = Number(amount)
    const sbpBonus = useMemo(() => {
      if (!billingConfig.sbpBonusEnabled) return 0
      if (!Number.isFinite(amountValue) || amountValue <= 0) return 0
      return Math.round(amountValue * billingConfig.sbpBonusRate * 100) / 100
    }, [amountValue, billingConfig.sbpBonusEnabled, billingConfig.sbpBonusRate])
    const totalWithSbpBonus =
      Number.isFinite(amountValue) && amountValue > 0
        ? amountValue + sbpBonus
        : 0
    const visibleBillingProviders = getVisibleWebBillingProviders({
      isDeveloper: loggedUserActiveRole?.dev === true,
    })

    if (!user) return null

    const handleTopup = async (provider = PRIMARY_WEB_BILLING_PROVIDER.id) => {
      const value = Number(amount)
      if (!Number.isFinite(value) || value <= 0) {
        snackbar.error('Укажите сумму пополнения')
        return
      }
      setIsSaving(true)
      try {
        const response = await fetch(`/api/billing/${provider}/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            purpose: 'balance',
            amount: value,
          }),
        })
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

    return (
      <FormWrapper flex className="flex-col gap-3">
        <UserName user={user} className="text-lg font-bold" />
        <div className="text-sm text-gray-700">
          Деньги зачислятся на баланс после подтверждения оплаты Точкой.
        </div>
        {billingConfig.sbpBonusEnabled ? (
          <Notice tone="success" className="rounded">
            При оплате через СБП начислим бонус 2% к сумме пополнения.
            {totalWithSbpBonus > 0 ? (
              <div className="mt-1 font-semibold">
                К зачислению через СБП:{' '}
                {totalWithSbpBonus.toLocaleString('ru-RU')} руб. включая бонус{' '}
                {sbpBonus.toLocaleString('ru-RU')} руб.
              </div>
            ) : null}
          </Notice>
        ) : null}
        <Input
          label="Сумма (руб.)"
          type="number"
          value={amount}
          onChange={setAmount}
          step={100}
        />
        <div className="flex flex-wrap justify-end gap-2">
          {visibleBillingProviders.map((provider) => (
            <Button
              key={provider.id}
              name={provider.paymentButtonLabel}
              className="h-9 px-4 text-sm"
              onClick={() => handleTopup(provider.id)}
              disabled={isSaving}
              loading={isSaving}
            />
          ))}
        </div>
      </FormWrapper>
    )
  }

  return {
    title: 'Пополнение баланса',
    declineButtonName: 'Закрыть',
    closeButtonShow: true,
    Children: UserTopupInfoModal,
  }
}

export default userTopupInfoFunc
