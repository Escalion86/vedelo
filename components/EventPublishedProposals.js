'use client'

import { useState } from 'react'
import ProposalStatusChip from '@components/ProposalStatusChip'
import { getProposalStatus } from '@helpers/proposalStatus.mjs'
import SurfaceCard from '@components/SurfaceCard'
import AppButton from '@components/AppButton'
import Notice from '@components/Notice'
import { useEventProposalsQuery } from '@helpers/useEventProposalsQuery'
import { apiJson } from '@helpers/apiClient'
import { formatMoney } from '@helpers/formatMoney'
import useSnackbar from '@helpers/useSnackbar'

export default function EventPublishedProposals({ eventId }) {
  const {
    data = [],
    isPending,
    isError,
    refetch,
  } = useEventProposalsQuery(eventId)
  const [openingId, setOpeningId] = useState(null)
  const snackbar = useSnackbar()
  const published = data.filter((item) => item.status === 'published' || getProposalStatus(item) === 'accepted')

  const open = async (proposal) => {
    // Открываем вкладку внутри клика, чтобы браузер не блокировал её после fetch.
    const tab = window.open('about:blank', '_blank')
    if (tab) tab.opener = null
    if (!tab) {
      snackbar.error('Разрешите открытие новой вкладки и повторите')
      return
    }
    setOpeningId(proposal._id)
    try {
      const body = await apiJson(`/api/proposals/${proposal._id}`, {
        cache: 'no-store',
      })
      if (!body.data?.publicUrl) throw new Error('missing_url')
      tab.location.replace(body.data.publicUrl)
    } catch {
      tab?.close()
      snackbar.error('Не удалось открыть предложение')
    } finally {
      setOpeningId(null)
    }
  }

  if (isPending) return null
  if (isError)
    return (
      <Notice tone="error">
        Не удалось загрузить коммерческие предложения
        <AppButton variant="secondary" size="sm" onClick={() => refetch()}>
          Повторить
        </AppButton>
      </Notice>
    )
  if (!published.length) return null

  return (
    <section
      className="event-published-proposals space-y-2"
      aria-label="Коммерческие предложения"
    >
      <SurfaceCard>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
          Коммерческие предложения
        </h3>
        <div className="space-y-2">
          {published.map((proposal) => {
            const selected = proposal.packages?.find(
              (item) => item.id === proposal.selectedPackageId
            )
            return (
              <SurfaceCard
                key={proposal._id}
                className="published-proposal-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 break-words">
                    <div className="font-semibold">{proposal.title}</div>
                    <div className="mt-2">
                      <ProposalStatusChip status={getProposalStatus(proposal)} />
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {proposal.status === 'expired' ? 'Срок истёк' : 'Опубликовано'} · Версия {proposal.version}
                    </p>
                    {proposal.validUntil ? (
                      <p className="mt-1 text-sm text-gray-600">
                        Действует до{' '}
                        {new Date(proposal.validUntil).toLocaleDateString(
                          'ru-RU'
                        )}
                      </p>
                    ) : null}
                    {selected ? (
                      <p className="mt-2 text-sm">
                        Выбор клиента: {selected.title} ·{' '}
                        {formatMoney(selected.total)}
                      </p>
                    ) : null}
                  </div>
                  <AppButton
                    variant="secondary"
                    size="sm"
                    disabled={Boolean(openingId)}
                    aria-busy={openingId === proposal._id}
                    onClick={() => open(proposal)}
                  >
                    Открыть предложение
                  </AppButton>
                </div>
              </SurfaceCard>
            )
          })}
        </div>
      </SurfaceCard>
    </section>
  )
}
