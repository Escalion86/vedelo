import FormWrapper from '@components/FormWrapper'
import ComboBox from '@components/ComboBox'
import Button from '@components/Button'
import Notice from '@components/Notice'
import tariffsAtom from '@state/atoms/tariffsAtom'
import userSelector from '@state/selectors/userSelector'
import userEditSelector from '@state/selectors/userEditSelector'
import { modalsFuncAtom } from '@state/atoms'
import { useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useMemo, useState } from 'react'
import useSnackbar from '@helpers/useSnackbar'
import getPersonFullName from '@helpers/getPersonFullName'

const userTariffChangeFunc = (userId, onSuccess) => {
  const UserTariffChangeModal = ({ closeModal }) => {
    const tariffs = useAtomValue(tariffsAtom)
    const user = useAtomValue(userSelector(userId))
    const setUser = useSetAtom(userEditSelector)
    const modalsFunc = useAtomValue(modalsFuncAtom)
    const snackbar = useSnackbar()

    const [tariffId, setTariffId] = useState(user?.tariffId ?? null)
    const [error, setError] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
      setTariffId(user?.tariffId ?? null)
    }, [user?.tariffId])

    const formatPrice = (price) =>
      Number(price ?? 0) > 0
        ? `${Number(price ?? 0).toLocaleString('ru-RU')} руб.`
        : 'Бесплатно'

    const addMonths = (date, count) => {
      const next = new Date(date)
      const day = next.getDate()
      next.setMonth(next.getMonth() + count)
      if (next.getDate() < day) {
        next.setDate(0)
      }
      return next
    }

    const calcCompensation = () => {
      const currentPrice = Number(currentTariff?.price ?? 0)
      if (!currentTariff || currentPrice <= 0) return 0
      if (!user?.tariffActiveUntil) return 0
      const activeUntil = new Date(user.tariffActiveUntil)
      const now = new Date()
      if (Number.isNaN(activeUntil.getTime()) || activeUntil <= now) return 0
      const periodStart = addMonths(activeUntil, -1)
      const periodMs = activeUntil.getTime() - periodStart.getTime()
      const remainingMs = activeUntil.getTime() - now.getTime()
      if (periodMs <= 0 || remainingMs <= 0) return 0
      return Math.floor((currentPrice * remainingMs) / periodMs)
    }

    const options = useMemo(
      () =>
        tariffs.map((tariff) => ({
          name: `${
            tariff?.hidden
              ? `${tariff.title || 'Тариф'} (скрытый)`
              : tariff.title || 'Тариф'
          } (${formatPrice(tariff?.price)})`,
          value: tariff._id,
        })),
      [tariffs]
    )

    const currentTariff = useMemo(
      () =>
        tariffs.find(
          (tariff) => String(tariff?._id) === String(user?.tariffId)
        ),
      [tariffs, user?.tariffId]
    )

    const selectedTariff = useMemo(
      () => tariffs.find((tariff) => String(tariff?._id) === String(tariffId)),
      [tariffs, tariffId]
    )

    const submitChange = async (skipCompensation = false) => {
      if (!user?._id) return
      setError('')
      setIsSaving(true)
      try {
        const res = await fetch(`/api/users/${user._id}`, {
          method: 'PUT',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            _id: user._id,
            tariffId,
            skipCompensation,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(data?.error || 'Не удалось сменить тариф')
          return
        }
        if (data?.data?._id) {
          setUser(data.data)
          snackbar.success('Тариф обновлен')
          onSuccess?.()
        }
        closeModal()
      } catch (err) {
        setError('Не удалось сменить тариф')
      } finally {
        setIsSaving(false)
      }
    }

    const handleSave = async () => {
      if (!user?._id) return
      const currentPrice = Number(currentTariff?.price ?? 0)
      const nextPrice = Number(selectedTariff?.price ?? 0)
      const isDowngrade =
        Number.isFinite(currentPrice) &&
        Number.isFinite(nextPrice) &&
        nextPrice < currentPrice

      if (isDowngrade) {
        const compensationAmount = calcCompensation()
        modalsFunc.add({
          title: 'Смена тарифа',
          text: `Компенсировать неиспользованный срок текущего тарифа${
            compensationAmount > 0
              ? ` (${compensationAmount.toLocaleString('ru-RU')} руб.)`
              : ''
          }?`,
          confirmButtonName: 'Компенсировать',
          confirmButtonName2: 'Без компенсации',
          onConfirm: () => submitChange(false),
          onConfirm2: () => submitChange(true),
          showDecline: true,
        })
        return
      }

      await submitChange(false)
    }

    if (!user) return null

    return (
      <FormWrapper flex className="flex-col gap-3">
        <div className="w-full text-center">
          Пользователь {getPersonFullName(user, { fallback: '-' })}
        </div>
        <div className="text-sm text-gray-600">
          Текущий баланс пользователя:{' '}
          {Number(user.balance ?? 0).toLocaleString('ru-RU')} руб.
        </div>
        <ComboBox
          label="Тариф"
          items={options}
          placeholder="Не выбран"
          activePlaceholder
          value={tariffId ?? ''}
          onChange={(value) => setTariffId(value || null)}
          fullWidth
        />
        {error && (
          <Notice tone="error" role="alert" className="rounded-md">
            {error}
          </Notice>
        )}
        <div className="flex justify-end gap-2">
          <Button
            name="Пополнить баланс"
            className="px-4 text-sm h-9"
            classBgColor="bg-gray-200 text-gray-700"
            onClick={() => modalsFunc.user?.topup(user?._id)}
          />
          <Button
            name="Сохранить"
            className="px-4 text-sm h-9"
            onClick={handleSave}
            disabled={
              isSaving ||
              !tariffId ||
              String(user?.tariffId ?? '') === String(tariffId ?? '')
            }
            loading={isSaving}
          />
        </div>
      </FormWrapper>
    )
  }

  return {
    title: 'Смена тарифа',
    closeButtonShow: true,
    declineButtonName: 'Закрыть',
    Children: UserTariffChangeModal,
  }
}

export default userTariffChangeFunc
