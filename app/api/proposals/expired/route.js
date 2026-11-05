import { NextResponse } from 'next/server'
import Proposals from '@models/Proposals'
import Events from '@models/Events'
import dbConnect from '@server/dbConnect'
import getProposalRequestContext from '@server/proposalRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { canUseProposalBuilder } from '@helpers/proposalAccess'
import { summarizeProposalStatuses } from '@helpers/proposalStatus.mjs'

export const GET = async (req) => {
  const { tenantId, user } = await getProposalRequestContext(req)
  if (!tenantId || !user?._id)
    return NextResponse.json({ success: false }, { status: 401 })
  if (!canUseProposalBuilder(await getUserTariffAccess(user._id)))
    return NextResponse.json({ success: false }, { status: 403 })
  await dbConnect()
  const proposals = await Proposals.find({
    tenantId,
    status: { $in: ['published', 'expired'] },
  }).select('_id eventId title version validUntil status selectedPackageId sentAt')
    .sort({ version: -1 }).lean()
  const statuses = summarizeProposalStatuses(proposals)
  const eventIds = Object.keys(statuses).filter((id) => statuses[id] === 'expired')
  const events = eventIds.length ? await Events.find({
    tenantId,
    _id: { $in: eventIds },
    status: { $in: ['draft', 'active'] },
  }).select('_id eventType eventDate').lean() : []
  const byEvent = new Map(events.map((event) => [String(event._id), event]))
  // One reminder per open work item; a current or accepted version supersedes
  // historical expiry. Do not expose public credentials or client snapshots.
  const data = []
  for (const proposal of proposals) {
    const eventId = String(proposal.eventId)
    const event = byEvent.get(eventId)
    if (!event) continue
    data.push({
      _id: String(proposal._id), eventId, title: proposal.title,
      validUntil: proposal.validUntil, eventType: event.eventType,
      eventDate: event.eventDate,
    })
    byEvent.delete(eventId)
  }
  data.sort((a, b) => (new Date(a.validUntil || 0).getTime() || 0) - (new Date(b.validUntil || 0).getTime() || 0))
  return NextResponse.json({ success: true, data }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
