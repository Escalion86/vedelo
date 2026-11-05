'use client'

import { useState } from 'react'
import { useAtomValue } from 'jotai'
import tariffsAtom from '@state/atoms/tariffsAtom'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import { getUserTariffAccess } from '@helpers/tariffAccess'
import { canUseProposalBuilder } from '@helpers/proposalAccess'
import { useExpiredProposalsQuery } from '@helpers/useExpiredProposalsQuery'
import useWorkItemTerminology from '@helpers/useWorkItemTerminology'
import formatDateTime from '@helpers/formatDateTime'
import AppButton from '@components/AppButton'
import ModalSection from '@components/ModalSection'
import Notice from '@components/Notice'
import StatusChip from '@components/StatusChip'
import ProposalStatusChip from '@components/ProposalStatusChip'

export default function ExpiredProposals({ onOpenEvent }) {
  const user = useAtomValue(loggedUserAtom)
  const tariffs = useAtomValue(tariffsAtom)
  const terms = useWorkItemTerminology()
  const enabled = canUseProposalBuilder(getUserTariffAccess(user, tariffs))
  const { data = [], isPending, isError, refetch } =
    useExpiredProposalsQuery(enabled)
  const [visibleCount, setVisibleCount] = useState(5)
  if (!enabled || (!isPending && !isError && !data.length)) return null

  return (
    <ModalSection
      id="attention-expired-proposals"
      title="КП с истёкшим сроком"
      titleClassName="card-title"
      titleRight={data.length ? <StatusChip tone="overdue">{data.length}</StatusChip> : null}
    >
      {isPending ? (
        <p role="status" className="card-muted text-sm">Проверяем сроки предложений…</p>
      ) : isError ? (
        <Notice tone="error">
          <p>Не удалось проверить сроки предложений.</p>
          <AppButton variant="secondary" size="sm" onClick={() => refetch()}>Повторить</AppButton>
        </Notice>
      ) : (
        <>
          <p className="card-muted mb-3 text-sm">
            Клиент ещё не выбрал вариант. Откройте предложение, укажите будущий
            срок действия и сохраните.
          </p>
          <div className="flex flex-col gap-2">
            {data.slice(0, visibleCount).map((proposal) => (
              <div key={proposal.eventId} className="min-w-0 rounded-lg border border-gray-200 p-3">
                <div className="card-title break-words text-sm font-semibold">{proposal.title}</div>
                <div className="mt-2"><ProposalStatusChip status="expired" /></div>
                <div className="card-muted mt-2 break-words text-sm">
                  {proposal.eventType || terms.labelCapitalized}
                  {proposal.eventDate ? ` · ${formatDateTime(proposal.eventDate, true, false, true, false)}` : ''}
                </div>
                {proposal.validUntil ? (
                  <p className="card-muted mt-1 text-xs">
                    Срок действия: {new Date(proposal.validUntil).toLocaleDateString('ru-RU')}
                  </p>
                ) : null}
                <AppButton
                  className="mt-3 min-h-10"
                  variant="secondary"
                  size="sm"
                  onClick={() => onOpenEvent(proposal.eventId)}
                >
                  Открыть {terms.accusative}
                </AppButton>
              </div>
            ))}
          </div>
          {data.length > visibleCount ? (
            <AppButton
              className="mt-3"
              variant="secondary"
              size="sm"
              onClick={() => setVisibleCount((count) => count + 10)}
            >
              Показать ещё ({data.length - visibleCount})
            </AppButton>
          ) : null}
        </>
      )}
    </ModalSection>
  )
}
