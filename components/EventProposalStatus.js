'use client'

import { useAtomValue } from 'jotai'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import { canUseProposalBuilder } from '@helpers/proposalAccess'
import { useProposalStatusesQuery } from '@helpers/useProposalStatusesQuery'
import ProposalStatusChip from '@components/ProposalStatusChip'

export default function EventProposalStatus({ eventId }) {
  const user = useAtomValue(loggedUserAtom)
  const enabled = canUseProposalBuilder(user)
  const { data } = useProposalStatusesQuery(enabled)
  if (!enabled) return null
  return <ProposalStatusChip status={data?.[eventId]} />
}
