import { getProposalSocialContacts } from '@server/proposalSocialContacts'
import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Proposals from '@models/Proposals'
import Events from '@models/Events'
import dbConnect from '@server/dbConnect'
import getProposalRequestContext from '@server/proposalRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import {
  canUseProposalBuilder,
  PROPOSAL_BUILDER_ACCESS_ERROR,
} from '@helpers/proposalAccess'
import { buildProposalPreview } from '@server/proposalPreview.mjs'
const error = (message, status, code) =>
  NextResponse.json({ success: false, error: { message, code } }, { status })
// Read-only preview of an unsaved draft, using the public rendered snapshot.
export async function POST(req, { params }) {
  const { tenantId, user } = await getProposalRequestContext(req)
  if (!tenantId || !user?._id)
    return error('Не авторизован', 401, 'unauthorized')
  if (!canUseProposalBuilder(await getUserTariffAccess(user._id)))
    return error(PROPOSAL_BUILDER_ACCESS_ERROR, 403, 'proposal_tariff_required')
  const { id } = await params
  if (!mongoose.Types.ObjectId.isValid(id))
    return error('Некорректный ID', 400, 'bad_id')
  await dbConnect()
  const proposal = await Proposals.findOne({ _id: id, tenantId }).lean()
  if (
    !proposal ||
    !(await Events.findOne({ _id: proposal.eventId, tenantId }).lean())
  )
    return error('Предложение или работа не найдены', 404, 'not_found')
  const raw = await req.json().catch(() => null)
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return NextResponse.json({
    success: true,
    data: { ...buildProposalPreview(proposal, input), socialContacts: await getProposalSocialContacts(proposal) },
  })
}
