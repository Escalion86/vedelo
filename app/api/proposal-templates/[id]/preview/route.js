import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import ProposalTemplates from '@models/ProposalTemplates'
import Services from '@models/Services'
import dbConnect from '@server/dbConnect'
import getProposalRequestContext, { getProposalArtistProfile } from '@server/proposalRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import {
  canUseProposalBuilder,
  PROPOSAL_BUILDER_ACCESS_ERROR,
} from '@helpers/proposalAccess'
import { normalizeProposalPackages } from '@helpers/proposalContent'
import { buildProposalSnapshot } from '@server/proposals'
import { buildProposalPreview } from '@server/proposalPreview.mjs'
const error = (message, status, code) =>
  NextResponse.json({ success: false, error: { message, code } }, { status })
export async function POST(req, { params }) {
  const { tenantId, user } = await getProposalRequestContext(req)
  if (!tenantId || !user?._id)
    return error('Не авторизован', 401, 'unauthorized')
  const access = await getUserTariffAccess(user._id)
  if (!canUseProposalBuilder(access))
    return error(PROPOSAL_BUILDER_ACCESS_ERROR, 403, 'proposal_tariff_required')
  const artist = getProposalArtistProfile({ user, tenantId }, access)
  if (!artist) return error('Профиль недоступен', 403, 'profile_unavailable')
  const { id } = await params
  if (id !== 'new' && !mongoose.Types.ObjectId.isValid(id))
    return error('Некорректный ID', 400, 'bad_id')
  await dbConnect()
  const template =
    id === 'new'
      ? {}
      : await ProposalTemplates.findOne({ _id: id, tenantId }).lean()
  if (!template) return error('Шаблон не найден', 404, 'not_found')
  const raw = await req.json().catch(() => null)
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const services = await Services.find({ tenantId }).sort({ index: 1 }).lean()
  const packages = normalizeProposalPackages(
    input.defaults?.packages ?? template.defaults?.packages
  )
  const total = packages.reduce(
    (sum, item) => sum + (Number(item.total) || 0),
    0
  )
  const snapshot = buildProposalSnapshot({
    template: {
      ...template,
      ...(input.appearance !== undefined ? { appearance: input.appearance } : {}),
      ...(input.blocks !== undefined ? { blocks: input.blocks } : {}),
      ...(input.media !== undefined ? { media: input.media } : {}),
      ...(input.defaults !== undefined ? { defaults: input.defaults } : {}),
    },
    event: {
      eventType: 'Свадьба',
      eventDate: new Date(Date.now() + 30 * 86400000),
      contractSum: total,
    },
    client: { firstName: 'Анна', lastName: 'Петрова' },
    services: [],
    templateServices: services,
    artist,
    input: { packages },
  })
  return NextResponse.json({
    success: true,
    data: buildProposalPreview({
      ...snapshot,
      title: input.name ?? template.name ?? 'Предложение',
      status: 'draft',
      version: 1,
      tenantId,
      validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
    }),
  })
}
