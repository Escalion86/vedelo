'use client'

import { useState } from 'react'
import AppButton from '@components/AppButton'
import ComboBox from '@components/ComboBox'
import Notice from '@components/Notice'
import usePersonalTariffs from '@helpers/usePersonalTariffs'
import {
  hasRemainingTariffPeriod,
  sameTariffId,
} from '@helpers/personalTariffs.mjs'

export function PendingTariffNotice({ pending, busy, onCancel }) {
  if (!pending) return null
  const waiting = new Date(pending.startsAt) <= new Date()
  return (
    <Notice tone={waiting ? 'warning' : 'info'} role="status">
      <div className="flex flex-col gap-2">
        <span>
          {waiting ? 'Ожидает подключения' : 'Запланирован переход'}: «
          {pending.title}»
          {pending.price != null
            ? ` — ${pending.price.toLocaleString('ru-RU')} ₽/мес`
            : ''}
          .
        </span>
        <span>
          {waiting
            ? 'Для подключения пополните баланс. Переход выполнится при следующей проверке продления.'
            : `После окончания текущего периода ${new Date(pending.startsAt).toLocaleString('ru-RU')}. Сейчас списания не будет. В день перехода применяется действующая цена тарифа.`}
        </span>
        <AppButton variant="secondary" disabled={busy} onClick={onCancel}>
          Отменить переход
        </AppButton>
      </div>
    </Notice>
  )
}

export default function PersonalTariffSettings({ userId }) {
  const { data, busy, error, mutate } = usePersonalTariffs(userId)
  const [selected, setSelected] = useState('')
  if (!data)
    return (
      <Notice tone={error ? 'error' : 'info'}>
        {error || 'Загружаем персональные тарифы…'}
      </Notice>
    )
  const hidden = data.tariffs.filter((tariff) => tariff.hidden)
  return (
    <div className="flex flex-col gap-3 border-t border-gray-200 pt-3">
      <div className="font-semibold">Доступ к скрытым тарифам</div>
      <p className="text-sm">
        Изменения доступа сохраняются сразу. Разрешите только нужные тарифы.
        Доступ не меняет текущую подписку. Отзыв доступа отменяет
        запланированный переход; уже подключённый тариф продолжает продлеваться.
      </p>
      {hidden.length ? (
        hidden.map((tariff) => (
          <label
            key={tariff._id}
            className="flex min-h-10 cursor-pointer items-center gap-3"
          >
            <input
              type="checkbox"
              disabled={busy}
              checked={data.allowedTariffIds.some((id) =>
                sameTariffId(id, tariff._id)
              )}
              onChange={(event) =>
                mutate({
                  action: 'grant',
                  tariffId: tariff._id,
                  enabled: event.target.checked,
                })
              }
            />
            <span>
              {tariff.title} —{' '}
              {Number(tariff.price || 0).toLocaleString('ru-RU')} ₽/мес
            </span>
          </label>
        ))
      ) : (
        <span>
          Скрытых тарифов пока нет. Создайте тариф с отметкой «Скрытый» в
          настройках тарифов.
        </span>
      )}
      <PendingTariffNotice
        pending={data.pendingTariffChange}
        busy={busy}
        onCancel={() => mutate({ action: 'cancel' })}
      />
      {hasRemainingTariffPeriod(data) ? (
        <>
          <ComboBox
            label="Тариф после окончания текущего периода"
            placeholder="Выберите тариф"
            activePlaceholder
            disabled={busy}
            fullWidth
            value={selected}
            onChange={setSelected}
            items={data.tariffs
              .filter((tariff) => !sameTariffId(tariff._id, data.tariffId))
              .map((tariff) => ({
                value: tariff._id,
                name: `${tariff.title} — ${tariff.price} ₽/мес`,
              }))}
          />
          <AppButton
            variant="secondary"
            disabled={
              busy ||
              !selected ||
              sameTariffId(selected, data.pendingTariffChange?.tariffId)
            }
            aria-busy={busy}
            onClick={() => mutate({ action: 'schedule', tariffId: selected })}
          >
            Назначить после окончания текущего тарифа
          </AppButton>
          <p className="text-sm">
            При назначении скрытого тарифа доступ выдаётся только к выбранному
            тарифу.
          </p>
        </>
      ) : null}
      {error ? (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      ) : null}
    </div>
  )
}
