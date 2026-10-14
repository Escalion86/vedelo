import getUserTariffAccess from '@server/getUserTariffAccess'
import { NextResponse } from 'next/server'
import Proposals from '@models/Proposals'
import getProposalRequestContext from '@server/proposalRequestContext'
import { canUseProposalBuilder } from '@helpers/proposalAccess'
import { summarizeProposalStatuses } from '@helpers/proposalStatus.mjs'

export const GET = async (req) => {
  const { tenantId, user } = await getProposalRequestContext(req)
  if (!tenantId || !user?._id)
    return NextResponse.json({ success: false }, { status: 401 })
  if (!canUseProposalBuilder(await getUserTariffAccess(user._id)))
    return NextResponse.json({ success: false }, { status: 403 })
  const proposals = await Proposals.find({
    tenantId,
    status: { $in: ['published', 'expired'] },
  }).select('eventId status selectedPackageId sentAt validUntil -_id').lean()
  return NextResponse.json(
    { success: true, data: summarizeProposalStatuses(proposals) },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
