'use client'

import { useMemo, useState } from 'react'
import ContentHeader from '@components/ContentHeader'
import AddIconButton from '@components/AddIconButton'
import EmptyState from '@components/EmptyState'
import HeaderActions from '@components/HeaderActions'
import Input from '@components/Input'
import MutedText from '@components/MutedText'
import NativeSelect from '@components/NativeSelect'
import SectionCard from '@components/SectionCard'
import UsersList from '@layouts/lists/UsersList'
import { modalsFuncAtom } from '@state/atoms'
import { useAtomValue } from 'jotai'
import { useTariffsQuery, useUsersQuery } from '@helpers/useEntityQueries'
import {
  sortUsers,
  USER_SORT_MODES,
  USER_SORT_OPTIONS,
} from '@helpers/usersSort'
import {
  formatRegistrationSource,
  getUserRegistrationSource,
} from '@helpers/registrationSource.mjs'
import {
  ALL_TARIFFS,
  NO_TARIFF,
  getUserTariffBucket,
  matchesUserTariffFilter,
} from '@helpers/userTariffFilter.mjs'

const ALL_SOURCES = '__all__'
const EMPTY_SOURCE = '__empty__'

const formatPercent = (value, total) =>
  total > 0 ? `${Math.round((value / total) * 100)}%` : '—'

const funnelSteps = [
  ['Регистрации', 'registered'],
  ['Запрос демо', 'demoRequested'],
  ['Onboarding', 'onboarding'],
  ['Первая заявка', 'firstItem'],
  ['Возврат W1', 'returned'],
  ['Активированы', 'activated'],
  ['Оплатили', 'paid'],
]

const UsersContent = () => {
  const { data: users = [] } = useUsersQuery()
  const { data: tariffs = [] } = useTariffsQuery()
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState(USER_SORT_MODES.NAME)
  const [sourceFilter, setSourceFilter] = useState(ALL_SOURCES)
  const [tariffFilter, setTariffFilter] = useState(ALL_TARIFFS)

  const knownTariffIds = useMemo(
    () => new Set(tariffs.map((tariff) => String(tariff._id))),
    [tariffs]
  )

  const tariffStats = useMemo(() => {
    const counts = new Map(tariffs.map((tariff) => [String(tariff._id), 0]))
    let withoutTariff = 0

    users.forEach((user) => {
      const bucket = getUserTariffBucket(user, knownTariffIds)
      if (bucket === NO_TARIFF) {
        withoutTariff += 1
        return
      }
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
    })

    return { counts, withoutTariff }
  }, [knownTariffIds, tariffs, users])

  const sourceStats = useMemo(() => {
    const counts = new Map()
    users.forEach((user) => {
      const source = getUserRegistrationSource(user) || EMPTY_SOURCE
      const current = counts.get(source) ?? {
        source,
        registered: 0,
        demoRequested: 0,
        onboarding: 0,
        firstItem: 0,
        returned: 0,
        activated: 0,
        paid: 0,
      }
      current.registered += 1
      if (user.acquisitionFunnel?.pilotDemoRequestedAt)
        current.demoRequested += 1
      if (user.acquisitionFunnel?.onboardingCompletedAt) current.onboarding += 1
      if (user.acquisitionFunnel?.firstCrmItemCreatedAt) current.firstItem += 1
      if (user.acquisitionFunnel?.returnedWithin7DaysAt) current.returned += 1
      if (user.acquisitionFunnel?.activatedAt) current.activated += 1
      if (user.acquisitionFunnel?.paymentSucceededAt) current.paid += 1
      counts.set(source, current)
    })
    return Array.from(counts.values()).sort(
      (left, right) => right.registered - left.registered
    )
  }, [users])

  const funnelTotals = useMemo(
    () =>
      sourceStats.reduce(
        (totals, source) => {
          funnelSteps.forEach(([, key]) => {
            totals[key] += source[key]
          })
          return totals
        },
        {
          registered: 0,
          demoRequested: 0,
          onboarding: 0,
          firstItem: 0,
          returned: 0,
          activated: 0,
          paid: 0,
        }
      ),
    [sourceStats]
  )

  const filteredUsers = useMemo(() => {
    const lowerSearch = search.trim().toLowerCase()
    return sortUsers(
      users.filter((user) => {
        const userSource = getUserRegistrationSource(user) || EMPTY_SOURCE
        if (sourceFilter !== ALL_SOURCES && userSource !== sourceFilter) {
          return false
        }
        if (!matchesUserTariffFilter(user, tariffFilter, knownTariffIds)) {
          return false
        }
        if (!lowerSearch) return true
        return [
          user.firstName,
          user.secondName,
          user.thirdName,
          user.phone ? `+${user.phone}` : '',
          user.telegram ? `@${user.telegram}` : '',
          user.email,
          user.registrationSource,
          user.acquisition?.source,
          user.acquisition?.campaign,
        ]
          .join(' ')
          .toLowerCase()
          .includes(lowerSearch)
      }),
      sortMode
    )
  }, [knownTariffIds, search, sortMode, sourceFilter, tariffFilter, users])

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain pb-2">
      <ContentHeader>
        <HeaderActions
          left={<div />}
          right={
            <>
              <MutedText>Всего: {users.length}</MutedText>
              <AddIconButton
                onClick={() => modalsFunc.user?.add()}
                disabled={!modalsFunc.user?.add}
                title="Добавить пользователя"
                size="sm"
                variant="neutral"
              />
            </>
          }
        />
      </ContentHeader>
      <div className="tablet:grid-cols-2 desktop:grid-cols-[minmax(0,1fr)_200px_200px_220px] grid shrink-0 gap-2 p-2">
        <div className="tablet:col-span-2 desktop:col-span-1">
          <Input
            label="Поиск пользователя"
            value={search}
            onChange={setSearch}
            placeholder="Введите имя, телефон или контакт"
            noMargin
          />
        </div>
        <label className="input-label flex flex-col gap-1 text-xs font-semibold">
          Источник регистрации
          <NativeSelect
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value)}
            className="h-9 w-full cursor-pointer rounded border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800"
            arrowClassName="right-3"
          >
            <option value={ALL_SOURCES}>Все источники ({users.length})</option>
            {sourceStats.map(({ source, registered }) => (
              <option key={source} value={source}>
                {source === EMPTY_SOURCE
                  ? `Без метки (${registered})`
                  : `${formatRegistrationSource(source)} (${registered})`}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="input-label flex flex-col gap-1 text-xs font-semibold">
          Тариф
          <NativeSelect
            value={tariffFilter}
            onChange={(event) => setTariffFilter(event.target.value)}
            className="h-9 w-full cursor-pointer rounded border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800"
            arrowClassName="right-3"
          >
            <option value={ALL_TARIFFS}>Все тарифы ({users.length})</option>
            <option value={NO_TARIFF}>
              Без тарифа ({tariffStats.withoutTariff})
            </option>
            {tariffs.map((tariff) => (
              <option key={tariff._id} value={String(tariff._id)}>
                {tariff.title || 'Без названия'}
                {tariff.hidden ? ' — скрытый' : ''} (
                {tariffStats.counts.get(String(tariff._id)) ?? 0})
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="input-label flex flex-col gap-1 text-xs font-semibold">
          Сортировка
          <NativeSelect
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value)}
            className="h-9 w-full cursor-pointer rounded border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800"
            arrowClassName="right-3"
          >
            {USER_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>
      {sourceStats.length > 0 ? (
        <div className="shrink-0 px-2 pb-2">
          <details className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-gray-800">
              <span>Статистика привлечения</span>
              <span className="text-xs font-medium text-gray-500">
                {sourceStats.length} источников
              </span>
            </summary>
            <div className="grid gap-3 border-t border-gray-100 p-3">
              <div className="tablet:grid-cols-3 desktop:grid-cols-7 grid grid-cols-2 gap-2">
                {funnelSteps.map(([label, key]) => (
                  <div
                    key={key}
                    className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                  >
                    <div className="input-label text-xs font-semibold">
                      {label}
                    </div>
                    <div className="mt-1 text-xl font-semibold text-gray-900">
                      {funnelTotals[key]}
                    </div>
                    {key !== 'registered' ? (
                      <div className="text-xs text-gray-500">
                        {formatPercent(
                          funnelTotals[key],
                          funnelTotals.registered
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2">Источник</th>
                      {funnelSteps.map(([label, key]) => (
                        <th key={key} className="px-3 py-2">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sourceStats.map((source) => (
                      <tr
                        key={source.source}
                        className="border-t border-gray-100"
                      >
                        <td className="px-3 py-2 font-semibold text-gray-800">
                          {source.source === EMPTY_SOURCE
                            ? 'Без метки'
                            : formatRegistrationSource(source.source)}
                        </td>
                        {funnelSteps.map(([, key]) => (
                          <td key={key} className="px-3 py-2 text-gray-700">
                            {source[key]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        </div>
      ) : null}
      <SectionCard className="min-h-[360px] flex-1 shrink-0 overflow-hidden">
        {filteredUsers.length > 0 ? (
          <UsersList users={filteredUsers} />
        ) : (
          <EmptyState text="Пользователи не найдены" bordered={false} />
        )}
      </SectionCard>
    </div>
  )
}

export default UsersContent
