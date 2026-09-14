'use client'

import { useMemo, useState } from 'react'
import { useAtomValue } from 'jotai'
import { useRouter } from 'next/navigation'
import Button from '@components/Button'
import CheckBox from '@components/CheckBox'
import EmptyState from '@components/EmptyState'
import SectionCard from '@components/SectionCard'
import tariffsAtom from '@state/atoms/tariffsAtom'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import { buildExportDatasets, downloadCsv } from '@helpers/csvExport'
import { getUserTariffAccess } from '@helpers/tariffAccess'
import { useStatisticsQuery } from '@helpers/useStatisticsQuery'
import useWorkItemTerminology from '@helpers/useWorkItemTerminology'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'

const ExportContent = () => {
  const router = useRouter()
  const tariffs = useAtomValue(tariffsAtom)
  const loggedUser = useAtomValue(loggedUserAtom)
  const statisticsQuery = useStatisticsQuery()
  const terms = useWorkItemTerminology()
  const siteSettings = useAtomValue(siteSettingsAtom)
  const exportOptions = [
    { key: 'events', label: terms.pluralCapitalized },
    { key: 'requests', label: 'Заявки' },
    { key: 'transactions', label: 'Транзакции' },
  ]
  const [selected, setSelected] = useState({
    events: true,
    requests: true,
    transactions: true,
  })
  const access = getUserTariffAccess(loggedUser, tariffs)
  const hasSelection = Object.values(selected).some(Boolean)
  const datasets = useMemo(
    () => buildExportDatasets({ ...(statisticsQuery.data ?? {}), siteSettings }),
    [siteSettings, statisticsQuery.data]
  )

  const handleExport = () => {
    const fileSuffix = 'all-all-with-requests'
    exportOptions.forEach(({ key }) => {
      if (!selected[key]) return
      const dataset = datasets[key]
      downloadCsv(
        `vedelo-${key}-${fileSuffix}.csv`,
        dataset.headers,
        dataset.rows
      )
    })
  }

  if (!access.allowStatistics) {
    return (
      <div className="flex h-full flex-col p-4">
        <SectionCard className="flex min-h-0 flex-1 items-center justify-center px-4">
          <EmptyState bordered={false}>
            <div className="flex flex-col items-center gap-4 text-center text-gray-500">
              <div className="text-lg font-semibold text-gray-700">
                Экспорт доступен только на расширенном тарифе
              </div>
              <Button
                name="Сменить тариф"
                onClick={() => router.push('/cabinet/tariff-select')}
              />
            </div>
          </EmptyState>
        </SectionCard>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <SectionCard className="p-4">
        <div className="flex flex-col gap-4">
          <div>
            <div className="text-base font-semibold text-gray-900">
              Выберите данные для экспорта
            </div>
            <div className="mt-1 text-sm text-gray-500">
              Будут экспортированы все данные без фильтров по году и городу.
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {exportOptions.map(({ key, label }) => (
              <CheckBox
                key={key}
                checked={selected[key]}
                onClick={() =>
                  setSelected((current) => ({
                    ...current,
                    [key]: !current[key],
                  }))
                }
                label={label}
                noMargin
                wrapperClassName="min-h-10"
              />
            ))}
          </div>
          {statisticsQuery.isError ? (
            <div className="text-sm text-red-600">
              Не удалось загрузить данные для экспорта
            </div>
          ) : null}
          <div>
            <Button
              name="Экспортировать в CSV"
              onClick={statisticsQuery.isLoading ? undefined : handleExport}
              disabled={!hasSelection || statisticsQuery.isError}
              loading={statisticsQuery.isLoading}
            />
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

export default ExportContent
