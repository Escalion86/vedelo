'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import AppButton from '@components/AppButton'
import Input from '@components/Input'
import Textarea from '@components/Textarea'
import ComboBox from '@components/ComboBox'
import Notice from '@components/Notice'
import IconActionButton from '@components/IconActionButton'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'
import { faTrashAlt } from '@fortawesome/free-solid-svg-icons/faTrashAlt'
import { useAtomValue } from 'jotai'
import modalsFuncAtom from '@state/atoms/modalsFuncAtom'
import PromoCodeHistory, { PromoCodeDelete } from '@components/PromoCodeHistory'
import useSnackbar from '@helpers/useSnackbar'
import { validatePromoCode } from '@helpers/promoCodes.mjs'

const empty = () => ({
  code: '',
  amount: 0,
  tariffId: '',
  expiresAt: '',
  enabled: true,
  comment: '',
})
const localDate = (value) => {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10)
}
const load = async () => {
  const response = await fetch('/api/admin/promo-codes', { cache: 'no-store' })
  const body = await response.json()
  if (!response.ok || !body.success)
    throw new Error(body.error || 'Не удалось загрузить промокоды')
  return body.data
}

export default function PromoCodesContent({ tariffs = [] }) {
  const queryClient = useQueryClient()
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const query = useQuery({ queryKey: ['admin-promo-codes'], queryFn: load })
  const [form, setForm] = useState(null)
  const [original, setOriginal] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const snackbar = useSnackbar()
  const dirty = form !== null && JSON.stringify(form) !== original
  const remove = async (row) => {
    const response = await fetch('/api/admin/promo-codes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: row.code, revision: row.revision }),
    })
    const body = await response.json()
    await queryClient.invalidateQueries({ queryKey: ['admin-promo-codes'] })
    if (!response.ok || !body.success)
      throw new Error(body.error || 'Не удалось удалить промокод')
    if (form?._id === row._id) setForm(null)
    snackbar.success('Промокод удалён')
  }
  useEffect(() => {
    if (!dirty) return
    const warn = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const edit = (row) => {
    if (dirty && !window.confirm('Отменить несохранённые изменения промокода?'))
      return
    const next = row
      ? {
          ...row,
          tariffId: row.tariffId || '',
          expiresAt: localDate(row.expiresAt),
        }
      : empty()
    setForm(next)
    setOriginal(JSON.stringify(next))
    setError('')
  }
  const patch = (value) => {
    setForm((current) => ({ ...current, ...value }))
    setError('')
  }
  const save = async (event) => {
    event.preventDefault()
    if (lock.current) return
    const payload = {
      ...form,
      amount: Number(form.amount),
      tariffId: form.tariffId || null,
      expiresAt:
        form.expiresAt &&
        Number.isFinite(new Date(`${form.expiresAt}T23:59:59.999`).getTime())
          ? new Date(`${form.expiresAt}T23:59:59.999`).toISOString()
          : '',
    }
    const validation = validatePromoCode(payload)
    if (validation.error) {
      setError(validation.error)
      return
    }
    lock.current = true
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/admin/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json()
      if (!response.ok || !body.success)
        throw new Error(body.error || 'Не удалось сохранить промокод')
      setForm(null)
      await queryClient.invalidateQueries({ queryKey: ['admin-promo-codes'] })
      snackbar.success('Промокод сохранён')
    } catch (err) {
      setError(err.message)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Notice tone="info">
          Промокод одноразовый для каждого аккаунта. Можно начислить бонус,
          открыть доступ к скрытому тарифу или совместить оба предложения. Тариф
          пользователь подключает сам по его действующей цене.
        </Notice>
        {!form && (
          <div>
            <AppButton onClick={() => edit(null)}>Создать промокод</AppButton>
          </div>
        )}
        {form && (
          <form
            onSubmit={save}
            className="flex flex-col gap-3 rounded-xl border border-gray-300 p-4"
          >
            <h2 className="text-lg font-semibold">
              {form._id ? `Промокод ${form.code}` : 'Новый промокод'}
            </h2>
            <Input
              ariaLabel="Код"
              label="Код"
              value={form.code}
              onChange={(code) => patch({ code })}
              disabled={busy || Boolean(form._id)}
              maxLength={40}
              noMargin
            />
            <Input
              ariaLabel="Бонус на баланс"
              label="Бонус на баланс"
              type="number"
              min={0}
              max={1000000}
              decimalScale={2}
              postfix="₽"
              value={form.amount}
              onChange={(amount) => patch({ amount })}
              disabled={busy}
              noMargin
            />
            <ComboBox
              label="Доступ к скрытому тарифу"
              value={form.tariffId}
              onChange={(tariffId) => patch({ tariffId })}
              disabled={busy}
              noMargin
              items={[
                { value: '', name: 'Без тарифа' },
                ...tariffs
                  .filter((t) => t.hidden)
                  .map((t) => ({
                    value: String(t._id),
                    name: `${t.title} — ${t.price} ₽/мес`,
                  })),
              ]}
            />
            <Input
              ariaLabel="Последний день активации (включительно, местное время)"
              label="Последний день активации (включительно, местное время)"
              type="date"
              value={form.expiresAt}
              onChange={(expiresAt) => patch({ expiresAt })}
              disabled={busy}
              noMargin
            />
            <ComboBox
              label="Состояние"
              value={form.enabled ? 'on' : 'off'}
              onChange={(value) => patch({ enabled: value === 'on' })}
              disabled={busy}
              noMargin
              items={[
                { value: 'on', name: 'Включён' },
                { value: 'off', name: 'Отключён' },
              ]}
            />
            <Textarea
              ariaLabel="Комментарий для администратора"
              label="Комментарий для администратора"
              value={form.comment}
              onChange={(comment) => patch({ comment })}
              disabled={busy}
              maxLength={2000}
              noMargin
            />
            <p className="text-sm text-gray-600">
              Срок ограничивает активацию кода. Выданные бонусы и доступ к
              тарифу сохраняются. Код после создания не переименовывается.
            </p>
            {error && (
              <Notice tone="error" role="alert">
                {error}
              </Notice>
            )}
            <div className="flex flex-wrap gap-2">
              <AppButton type="submit" disabled={busy} aria-busy={busy}>
                {busy ? 'Сохранение…' : 'Сохранить'}
              </AppButton>
              <AppButton
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  if (
                    !dirty ||
                    window.confirm(
                      'Отменить несохранённые изменения промокода?'
                    )
                  )
                    setForm(null)
                }}
              >
                Отмена
              </AppButton>
            </div>
          </form>
        )}
        {query.isPending && <p role="status">Загрузка промокодов…</p>}
        {query.error && (
          <Notice tone="error" role="alert">
            {query.error.message}
            <AppButton variant="secondary" onClick={() => query.refetch()}>
              Повторить
            </AppButton>
          </Notice>
        )}
        {query.data?.length === 0 && <p>Промокодов пока нет.</p>}
        {query.data?.map((row) => (
          <article
            key={row._id}
            className="flex items-start gap-3 rounded-xl border border-gray-300 p-4"
          >
            <div className="min-w-0 flex-1 break-words">
              <h2 className="font-semibold">{row.code}</h2>
              <p className="text-sm">
                Пользователей, использовавших код: {row.usageCount ?? 0}
              </p>
              <AppButton
                variant="ghost"
                size="sm"
                onClick={() =>
                  modalsFunc.add({
                    title: `Пользователи промокода ${row.code}`,
                    declineButtonName: 'Закрыть',
                    closeButtonShow: true,
                    Children: () => <PromoCodeHistory code={row.code} />,
                  })
                }
              >
                Кто воспользовался
              </AppButton>
              <p className="text-sm">
                {!row.enabled
                  ? 'Отключён'
                  : new Date(row.expiresAt) <= new Date()
                    ? 'Истёк'
                    : 'Активен'}{' '}
                · до {new Date(row.expiresAt).toLocaleString('ru-RU')}
              </p>
              {row.amount > 0 && (
                <p>Бонус: {row.amount.toLocaleString('ru-RU')} ₽</p>
              )}
              {row.tariffId && (
                <p>
                  Доступ к тарифу:{' '}
                  {tariffs.find((t) => String(t._id) === String(row.tariffId))
                    ?.title || 'Тариф недоступен'}
                </p>
              )}
              {row.comment && (
                <p className="mt-2 text-sm whitespace-pre-wrap text-gray-600">
                  {row.comment}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <IconActionButton
                icon={faPencilAlt}
                variant="warning"
                title={`Редактировать ${row.code}`}
                disabled={busy}
                onClick={() => edit(row)}
              />
              {row.canDelete && (
                <IconActionButton
                  icon={faTrashAlt}
                  variant="danger"
                  title={`Удалить ${row.code}`}
                  disabled={busy || form?._id === row._id}
                  onClick={() =>
                    modalsFunc.add({
                      title: `Удаление ${row.code}`,
                      declineButtonName: 'Отмена',
                      closeButtonName: 'Отмена',
                      closeButtonShow: true,
                      Children: (props) => (
                        <PromoCodeDelete
                          {...props}
                          row={row}
                          onDelete={remove}
                        />
                      ),
                    })
                  }
                />
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
