import getUserTariffAccess from '@server/getUserTariffAccess'
import { NextResponse } from 'next/server'
import ProposalTemplates from '@models/ProposalTemplates'
import Services from '@models/Services'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import {
  canUseProposalBuilder,
  PROPOSAL_BUILDER_ACCESS_ERROR,
} from '@helpers/proposalAccess'
import {
  materializeProposalTemplateDefaults,
  normalizeProposalBlocks,
  normalizeProposalMedia,
  normalizeProposalTemplateDefaults,
} from '@helpers/proposalContent'

const error = (message, status = 400, code = 'bad_request') =>
  NextResponse.json({ success: false, error: { code, message } }, { status })

export const GET = async () => {
  const { tenantId, user } = await getTenantContext()
  if (!tenantId || !user?._id) return error('Не авторизован', 401, 'unauthorized')
  if (!canUseProposalBuilder(await getUserTariffAccess(user._id)))
    return error(PROPOSAL_BUILDER_ACCESS_ERROR, 403, 'proposal_tariff_required')
  await dbConnect()
  const items = await ProposalTemplates.find({ tenantId })
    .sort({ updatedAt: -1 })
    .lean()
  // Шаблоны старого формата отдаём уже с вариантами.
  const services = await Services.find({ tenantId }).sort({ index: 1 }).lean()
  const data = items.map((item) => ({
    ...item,
    defaults: materializeProposalTemplateDefaults(item.defaults, services),
  }))
  return NextResponse.json({ success: true, data })
}

export const POST = async (req) => {
  const { tenantId, user } = await getTenantContext()
  if (!tenantId || !user?._id) return error('Не авторизован', 401, 'unauthorized')
  if (!canUseProposalBuilder(await getUserTariffAccess(user._id)))
    return error(PROPOSAL_BUILDER_ACCESS_ERROR, 403, 'proposal_tariff_required')
  const body = await req.json().catch(() => ({}))
  const name = String(body?.name || '').trim().slice(0, 160)
  if (!name) return error('Укажите название шаблона', 400, 'name_required')
  await dbConnect()
  const item = await ProposalTemplates.create({
    tenantId,
    name,
    status: body?.status === 'archived' ? 'archived' : 'active',
    blocks: normalizeProposalBlocks(body?.blocks),
    messageTemplate: String(body?.messageTemplate || '').trim().slice(0, 4000),
    media: normalizeProposalMedia(body?.media),
    defaults: normalizeProposalTemplateDefaults(body?.defaults),
  })
  return NextResponse.json({ success: true, data: item }, { status: 201 })
}
