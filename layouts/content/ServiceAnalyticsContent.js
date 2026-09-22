'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { apiJson } from '@helpers/apiClient'
import AppButton from '@components/AppButton'
import Input from '@components/Input'
import Notice from '@components/Notice'
import SectionCard from '@components/SectionCard'
import styles from './ServiceAnalyticsContent.module.css'

const BillingHistoryContent = dynamic(() => import('./BillingHistoryContent'))

const tabs = [
  ['overview', 'Обзор'],
  ['money', 'Деньги'],
  ['growth', 'Рост'],
]
const money = (v) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v)
const number = (v) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(v)
const date = (v) =>
  v ? new Date(v).toLocaleDateString('ru-RU', { timeZone: 'UTC' }) : '—'
const format = (v, kind) =>
  v === null
    ? 'Нет данных'
    : kind === 'money'
      ? money(v)
      : kind === 'percent'
        ? `${number(v)}%`
        : number(v)

function Metric({ label, value, previous, kind, onClick }) {
  const difference =
    value === null || previous === null
      ? 'Недостаточно данных для сравнения'
      : previous === 0
        ? value === 0
          ? 'Без изменений'
          : 'В прошлом периоде — 0'
        : `${value >= previous ? '+' : ''}${number(kind === 'percent' ? value - previous : ((value - previous) / previous) * 100)} ${kind === 'percent' ? 'п. п.' : '%'} к прошлому периоду`
  return (
    <button type="button" onClick={onClick} className={styles.metric}>
      <span>{label}</span>
      <strong>{format(value, kind)}</strong>
      <small>{difference}</small>
    </button>
  )
}

function Trend({ title, rows, field, monetary = false }) {
  // SVG is bounded to at most 366 points; React owns all rendering.
  const max = Math.max(1, ...rows.map((r) => r[field]))
  const points = rows
    .map(
      (r, i) =>
        `${45 + (i * 540) / Math.max(1, rows.length - 1)},${145 - (r[field] / max) * 115}`
    )
    .join(' ')
  return (
    <SectionCard className="min-w-0 p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <svg
        viewBox="0 0 620 175"
        role="img"
        aria-label={`${title}. Максимум ${monetary ? money(max) : max}. Точные значения в таблице ниже.`}
        className={styles.chart}
      >
        <text x="3" y="23">
          {number(max)}
        </text>
        <text x="22" y="148">
          0
        </text>
        <path
          d="M45 28 V145 H590"
          fill="none"
          stroke="currentColor"
          opacity=".3"
        />
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        {rows.length === 1 ? (
          <circle
            cx="45"
            cy={145 - (rows[0][field] / max) * 115}
            r="4"
            fill="currentColor"
          />
        ) : null}
        <text x="45" y="168">
          {date(rows[0]?.date)}
        </text>
        <text x="585" y="168" textAnchor="end">
          {date(rows.at(-1)?.date)}
        </text>
      </svg>
      <details>
        <summary className="cursor-pointer py-2 text-sm">
          Значения по дням
        </summary>
        <div className={styles.scroll}>
          <table>
            <thead>
              <tr>
                <th>Дата (UTC)</th>
                <th>{monetary ? 'Рубли' : 'Пользователи'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date}>
                  <td>{date(r.date)}</td>
                  <td>{monetary ? money(r[field]) : r[field]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </SectionCard>
  )
}

export default function ServiceAnalyticsContent({ loggedUser }) {
  const router = useRouter(),
    pathname = usePathname(),
    search = useSearchParams()
  const [openedAt] = useState(() => Date.now())
  const today = new Date(openedAt).toISOString().slice(0, 10)
  const defaultFrom = new Date(openedAt - 29 * 86400000)
    .toISOString()
    .slice(0, 10)
  const from = search.get('from') || defaultFrom,
    to = search.get('to') || today
  const tab = tabs.some(([key]) => key === search.get('tab'))
    ? search.get('tab')
    : 'overview'
  const exclude = search.get('exclude') || ''
  const [draft, setDraft] = useState(null)
  const rangeKey = `${from}/${to}`
  const draftFrom = draft?.key === rangeKey ? draft.from : from
  const draftTo = draft?.key === rangeKey ? draft.to : to
  const setDraftFrom = (value) =>
    setDraft({ key: rangeKey, from: value, to: draftTo })
  const setDraftTo = (value) =>
    setDraft({ key: rangeKey, from: draftFrom, to: value })
  const [detail, setDetail] = useState(null),
    [detailPage, setDetailPage] = useState(0),
    [historyUser, setHistoryUser] = useState(null)
  const [accountSearch, setAccountSearch] = useState('')
  const detailRef = useRef(null)
  useEffect(() => {
    if (detail) detailRef.current?.scrollIntoView({ block: 'start' })
  }, [detail])
  const update = (changes) => {
    const next = new URLSearchParams(search.toString())
    for (const [key, value] of Object.entries(changes))
      value ? next.set(key, value) : next.delete(key)
    router.replace(`${pathname}?${next}`, { scroll: false })
    setDetail(null)
    setHistoryUser(null)
    setDetailPage(0)
  }
  const query = useQuery({
    queryKey: ['serviceAnalytics', loggedUser?._id, from, to, exclude],
    queryFn: ({ signal }) =>
      apiJson(
        `/api/developer/analytics?${new URLSearchParams({ from, to, exclude })}`,
        { signal }
      ),
    enabled: loggedUser?.role === 'dev',
    staleTime: 60000,
    retry: false,
  })
  if (loggedUser?.role !== 'dev')
    return <Notice tone="error">Раздел доступен только разработчику.</Notice>
  const data = query.data?.data,
    meta = query.data?.meta
  const openDetail = (kind) => {
    setDetail(kind)
    setDetailPage(0)
    setHistoryUser(null)
  }
  const rows =
    data?.users.filter((u) =>
      detail === 'registrations'
        ? u.newUser
        : detail === 'firstPayers'
          ? u.receipts > 0 && new Date(u.firstPaymentAt) >= new Date(meta.from)
          : detail === 'expiring'
            ? u.expiresSoon
            : detail === 'source'
              ? u.newUser
              : detail === 'conversion'
                ? u.newUser && u.mature
                : detail === 'repeatPayments'
                  ? u.payments >
                    (new Date(u.firstPaymentAt) >= new Date(meta.from) ? 1 : 0)
                  : u.receipts > 0
    ) || []
  return (
    <div className={styles.root}>
      <p>Рост аудитории и расчёты пользователей с Ведело</p>
      <div className={styles.tabs} aria-label="Разделы аналитики">
        {tabs.map(([key, label]) => (
          <AppButton
            key={key}
            variant={tab === key ? 'primary' : 'secondary'}
            aria-pressed={tab === key}
            onClick={() => update({ tab: key })}
          >
            {label}
          </AppButton>
        ))}
      </div>
      <SectionCard className="p-4">
        <div className="flex flex-wrap gap-2">
          {[7, 30, 90].map((days) => (
            <AppButton
              key={days}
              size="sm"
              variant="secondary"
              onClick={() => {
                const start = new Date(Date.now() - (days - 1) * 86400000)
                  .toISOString()
                  .slice(0, 10)
                setDraftFrom(start)
                setDraftTo(today)
                update({ from: start, to: today })
              }}
            >
              {days} дней
            </AppButton>
          ))}
        </div>
        <form
          className={styles.filters}
          onSubmit={(e) => {
            e.preventDefault()
            update({ from: draftFrom, to: draftTo })
          }}
        >
          <Input
            label="С даты (UTC)"
            type="date"
            value={draftFrom}
            onChange={setDraftFrom}
            max={draftTo || today}
            required
          />
          <Input
            label="По дату (UTC)"
            type="date"
            value={draftTo}
            onChange={setDraftTo}
            min={draftFrom}
            max={today}
            required
          />
          <AppButton type="submit">Применить</AppButton>
          <AppButton
            variant="secondary"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            Обновить
          </AppButton>
        </form>
        <p className="mt-2 text-sm">
          Период: {date(from)} — {date(to)}. Разработчики и администраторы
          исключены.
        </p>
        <details className="mt-2">
          <summary className="cursor-pointer py-2 text-sm">
            Исключить тестовые аккаунты (
            {exclude.split(',').filter(Boolean).length})
          </summary>
          <Input
            label="Поиск аккаунта по имени"
            value={accountSearch}
            onChange={setAccountSearch}
          />
          <div className={styles.accounts}>
            {data?.excludedOptions
              .filter((u) =>
                u.name.toLowerCase().includes(accountSearch.toLowerCase())
              )
              .map((u) => (
                <label key={u.id}>
                  <input
                    type="checkbox"
                    checked={exclude.split(',').includes(u.id)}
                    onChange={(e) => {
                      const ids = new Set(exclude.split(',').filter(Boolean))
                      e.target.checked ? ids.add(u.id) : ids.delete(u.id)
                      update({ exclude: [...ids].join(',') })
                    }}
                  />{' '}
                  {u.name}
                </label>
              ))}
          </div>
          <AppButton
            size="sm"
            variant="secondary"
            onClick={() => update({ exclude: '' })}
          >
            Сбросить исключения
          </AppButton>
        </details>
      </SectionCard>
      {query.isPending ? (
        <Notice role="status">Загрузка аналитики…</Notice>
      ) : null}
      {query.isError ? (
        <Notice tone="error" role="alert">
          {query.error.message}
        </Notice>
      ) : null}
      {data ? (
        <>
          <p className="text-sm">
            Обновлено: {new Date(meta.generatedAt).toLocaleString('ru-RU')}.
            Сравнение: {date(meta.previousStart)} —{' '}
            {date(new Date(+new Date(meta.previousEnd) - 1))}, такая же
            длительность. Сегодняшний день неполный.
          </p>
          <div className={styles.metrics}>
            {(tab === 'money'
              ? [
                  ['receipts', 'Поступления', 'money'],
                  ['payments', 'Успешные платежи'],
                  ['payers', 'Плательщики'],
                  ['firstPayers', 'Впервые оплатили'],
                  ['repeatPayments', 'Повторные платежи'],
                  ['average', 'Средний платёж', 'money'],
                ]
              : [
                  ['registrations', 'Регистрации'],
                  ['receipts', 'Поступления', 'money'],
                  ['payers', 'Плательщики'],
                  ['firstPayers', 'Впервые оплатили'],
                  ['conversion', 'Оплатили за 30 дней', 'percent'],
                ]
            ).map(([key, label, kind]) => (
              <Metric
                key={key}
                label={label}
                value={data.current[key]}
                previous={data.previous[key]}
                kind={kind}
                onClick={() => openDetail(key)}
              />
            ))}
          </div>
          <p className="text-sm">
            Конверсия: {data.current.converted} из {data.current.mature}{' '}
            регистраций с полными 30 днями наблюдения. При нулевой базе процент
            не рассчитывается.
          </p>
          <div className={styles.columns}>
            {tab !== 'money' ? (
              <Trend
                title="Регистрации по дням"
                rows={data.daily}
                field="registrations"
              />
            ) : null}
            {tab !== 'growth' ? (
              <Trend
                title="Поступления по дням, ₽"
                rows={data.daily}
                field="receipts"
                monetary
              />
            ) : null}
          </div>
          {tab === 'overview' ? (
            <SectionCard className="p-4">
              <h2 className="mb-3 font-semibold">Требует внимания</h2>
              <p>
                Операции за период: ожидают — {data.current.pending}, с ошибкой
                — {data.current.failed}, отменены — {data.current.canceled}.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  className={styles.link}
                  href="/cabinet/billing-operations"
                >
                  Открыть все операции
                </Link>
                <button
                  className={styles.link}
                  onClick={() => openDetail('expiring')}
                >
                  Тариф заканчивается за 7 дней: {data.expiring}
                </button>
              </div>
              <Notice tone="info" className="mt-4">
                Для будущей вкладки «Использование» начат сбор посещений Web/PWA
                по дням. История до внедрения и активность Android пока не
                учитываются.
              </Notice>
            </SectionCard>
          ) : null}
          {tab === 'money' ? (
            <>
              <Notice tone="info">
                Поступления — успешные внешние платежи Точки и ЮKassa. Списания
                с баланса не прибавляются к поступлениям. Возвраты на баланс не
                означают возврат через банк; комиссии и прибыль здесь не
                рассчитываются.
              </Notice>
              <SectionCard className="p-4">
                <h2 className="mb-3 font-semibold">
                  Движение внутреннего баланса
                </h2>
                <div className={styles.scroll}>
                  <table>
                    <thead>
                      <tr>
                        <th>Категория</th>
                        <th>За период</th>
                        <th>Прошлый период</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['tariffs', 'Списания за тарифы'],
                        ['ai', 'Списания за ИИ'],
                        ['charges', 'Прочие списания'],
                        ['bonuses', 'Бонусные пополнения'],
                        ['manual', 'Ручные пополнения'],
                        ['refunds', 'Возвраты на баланс'],
                      ].map(([key, label]) => (
                        <tr key={key}>
                          <td>{label}</td>
                          <td>{money(data.current[key])}</td>
                          <td>{money(data.previous[key])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Link
                  className={styles.link}
                  href="/cabinet/billing-operations"
                >
                  Посмотреть операции
                </Link>
              </SectionCard>
              <SectionCard className="p-4">
                <h2 className="font-semibold">
                  Назначенные тарифы на текущий момент
                </h2>
                <p className="my-2 text-sm">
                  Выдача доступа вручную не подтверждает оплату. Поэтому доступ
                  вне пробного периода показан отдельно, без пометки «оплачен».
                </p>
                <div className={styles.scroll}>
                  <table>
                    <thead>
                      <tr>
                        <th>Тариф</th>
                        <th>Всего</th>
                        <th>Пробный</th>
                        <th>Вне пробного</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.distribution.map((row) => (
                        <tr key={row.title}>
                          <td>{row.title}</td>
                          <td>{row.total}</td>
                          <td>{row.trial}</td>
                          <td>{row.other}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </>
          ) : null}
          {tab === 'growth' ? (
            <>
              <SectionCard className="p-4">
                <h2 className="font-semibold">Этапы освоения сервиса</h2>
                <p className="my-2 text-sm">
                  Пользователи, зарегистрированные за выбранный период;
                  достижения по состоянию на сегодня. Этапы независимы: оплатить
                  можно до создания заказа.
                </p>
                {[
                  ['registered', 'Регистрация'],
                  ['onboarding', 'Знакомство завершено'],
                  ['order', 'Первый реальный заказ'],
                  ['action', 'Первое следующее действие'],
                  ['activated', 'Активация'],
                  ['paid', 'Первая внешняя оплата'],
                ].map(([key, label]) => (
                  <div key={key} className={styles.stage}>
                    <span>{label}</span>
                    <meter
                      min="0"
                      max={Math.max(1, data.funnel.registered)}
                      value={data.funnel[key]}
                      aria-label={label}
                    />
                    <strong>{data.funnel[key]}</strong>
                  </div>
                ))}
              </SectionCard>
              <SectionCard className="p-4">
                <h2 className="mb-3 font-semibold">Источники и кампании</h2>
                <div className={styles.scroll}>
                  <table>
                    <thead>
                      <tr>
                        <th>Источник / кампания</th>
                        <th>Регистрации</th>
                        <th>Создали заказ</th>
                        <th>Оплатили к сегодня</th>
                        <th>Конверсия за 30 дней</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sources.map((r) => (
                        <tr key={JSON.stringify([r.source, r.campaign])}>
                          <td>
                            {r.source}
                            <small className="block">{r.campaign}</small>
                          </td>
                          <td>{r.registered}</td>
                          <td>{r.orders}</td>
                          <td>{r.paid}</td>
                          <td>
                            {r.mature
                              ? `${number((100 * r.converted) / r.mature)}% (${r.converted}/${r.mature})`
                              : 'Недостаточно данных'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!data.sources.length ? (
                    <p>За этот период регистраций нет.</p>
                  ) : null}
                </div>
              </SectionCard>
            </>
          ) : null}
          {detail ? (
            <section ref={detailRef} className="ui-surface-card rounded-lg p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">
                  {detail === 'expiring'
                    ? 'Истекающие тарифы'
                    : ['registrations', 'conversion', 'source'].includes(detail)
                      ? 'Регистрации за период'
                      : 'Плательщики за период'}
                  : {rows.length}
                </h2>
                <AppButton
                  size="sm"
                  variant="secondary"
                  onClick={() => setDetail(null)}
                >
                  Закрыть
                </AppButton>
              </div>
              <div className={styles.scroll}>
                <table>
                  <thead>
                    <tr>
                      <th>Пользователь</th>
                      <th>Регистрация</th>
                      <th>Первая оплата</th>
                      <th>Поступления за период</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows
                      .slice(detailPage * 25, (detailPage + 1) * 25)
                      .map((u) => (
                        <tr key={u.id}>
                          <td>
                            <button
                              className={styles.link}
                              onClick={() => setHistoryUser(u)}
                            >
                              {u.name}
                            </button>
                          </td>
                          <td>{date(u.registeredAt)}</td>
                          <td>{date(u.firstPaymentAt)}</td>
                          <td>{money(u.receipts)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!rows.length ? (
                <p>Нет пользователей по выбранному показателю.</p>
              ) : null}
              <div className="mt-3 flex gap-2">
                <AppButton
                  size="sm"
                  variant="secondary"
                  disabled={!detailPage}
                  onClick={() => setDetailPage(detailPage - 1)}
                >
                  Назад
                </AppButton>
                <AppButton
                  size="sm"
                  variant="secondary"
                  disabled={(detailPage + 1) * 25 >= rows.length}
                  onClick={() => setDetailPage(detailPage + 1)}
                >
                  Далее
                </AppButton>
              </div>
            </section>
          ) : null}
          {historyUser ? (
            <SectionCard className="p-4">
              <div className="mb-4 flex justify-between gap-2">
                <h2 className="font-semibold">История: {historyUser.name}</h2>
                <AppButton
                  size="sm"
                  variant="secondary"
                  onClick={() => setHistoryUser(null)}
                >
                  Закрыть историю
                </AppButton>
              </div>
              <BillingHistoryContent
                key={historyUser.id}
                embedded
                accountUser={{ _id: historyUser.id }}
                userId={historyUser.id}
              />
            </SectionCard>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
