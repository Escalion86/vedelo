import mongoose from 'mongoose'
import { NextResponse } from 'next/server'
import Events from '@models/Events'
import Clients from '@models/Clients'
import Services from '@models/Services'
import ProposalTemplates from '@models/ProposalTemplates'
import Proposals from '@models/Proposals'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import {
  canUseProposalBuilder,
  PROPOSAL_BUILDER_ACCESS_ERROR,
} from '@helpers/proposalAccess'
import { buildProposalSnapshot } from '@server/proposals'

const error = (message, status = 400, code = 'bad_request') =>
  NextResponse.json({ success: false, error: { code, message } }, { status })

const contextFor = async (eventId) => {
  const context = await getTenantContext()
  if (!context.tenantId || !context.user?._id) return { response: error('Не авторизован', 401, 'unauthorized') }
  if (!mongoose.Types.ObjectId.isValid(eventId)) return { response: error('Некорректный ID мероприятия', 400, 'bad_id') }
  if (!canUseProposalBuilder(context.user))
    return {
      response: error(
        PROPOSAL_BUILDER_ACCESS_ERROR,
        403,
        'developer_preview_only'
      ),
    }
  await dbConnect()
  const event = await Events.findOne({ _id: eventId, tenantId: context.tenantId }).lean()
  if (!event) return { response: error('Мероприятие не найдено', 404, 'not_found') }
  return { context, event }
}

export const GET = async (_req, { params }) => {
  const { id } = await params
  const resolved = await contextFor(id)
  if (resolved.response) return resolved.response
  await Proposals.updateMany(
    { tenantId: resolved.context.tenantId, eventId: id, status: 'published', validUntil: { $lt: new Date() } },
    { $set: { status: 'expired' } }
  )
  const items = await Proposals.find({ tenantId: resolved.context.tenantId, eventId: id }).sort({ version: -1 }).lean()
  return NextResponse.json({ success: true, data: items })
}

export const POST = async (req, { params }) => {
  const { id } = await params
  const resolved = await contextFor(id)
  if (resolved.response) return resolved.response
  const body = await req.json().catch(() => ({}))
  const sourceProposalId = String(body?.sourceProposalId || '')
  if (mongoose.Types.ObjectId.isValid(sourceProposalId)) {
    const [source, latest] = await Promise.all([
      Proposals.findOne({ _id: sourceProposalId, tenantId: resolved.context.tenantId, eventId: id }).lean(),
      Proposals.findOne({ tenantId: resolved.context.tenantId, eventId: id }).sort({ version: -1 }).select('version').lean(),
    ])
    if (!source) return error('Исходное предложение не найдено', 404, 'source_not_found')
    const item = await Proposals.create({
      tenantId: resolved.context.tenantId,
      eventId: id,
      clientId: source.clientId || null,
      templateId: source.templateId || null,
      version: Number(latest?.version || 0) + 1,
      title: source.title,
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      blocksSnapshot: source.blocksSnapshot,
      packages: source.packages,
      mediaSnapshot: source.mediaSnapshot,
      messageText: source.messageText,
      eventSnapshot: source.eventSnapshot,
      clientSnapshot: source.clientSnapshot,
      artistSnapshot: source.artistSnapshot,
    })
    return NextResponse.json({ success: true, data: item }, { status: 201 })
  }
  const templateId = String(body?.templateId || '')
  if (templateId && !mongoose.Types.ObjectId.isValid(templateId)) return error('Некорректный шаблон', 400, 'template_required')
  const [template, client, services, latest] = await Promise.all([
    templateId ? ProposalTemplates.findOne({ _id: templateId, tenantId: resolved.context.tenantId, status: 'active' }).lean() : { name: 'Коммерческое предложение' },
    resolved.event.clientId
      ? Clients.findOne({ _id: resolved.event.clientId, tenantId: resolved.context.tenantId }).lean()
      : null,
    Services.find({ _id: { $in: resolved.event.servicesIds || [] }, tenantId: resolved.context.tenantId }).lean(),
    Proposals.findOne({ tenantId: resolved.context.tenantId, eventId: id }).sort({ version: -1 }).select('version').lean(),
  ])
  if (!template) return error('Шаблон не найден', 404, 'template_not_found')
  const snapshot = buildProposalSnapshot({
    template,
    event: resolved.event,
    client,
    services,
    artist: resolved.context.user,
    input: body,
  })
  const validUntil = body?.validUntil
    ? new Date(body.validUntil)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  if (Number.isNaN(validUntil.getTime())) return error('Некорректный срок действия', 400, 'bad_valid_until')
  const item = await Proposals.create({
    tenantId: resolved.context.tenantId,
    eventId: id,
    clientId: resolved.event.clientId || null,
    templateId: templateId || null,
    version: Number(latest?.version || 0) + 1,
    title: String(body?.title || template.name || 'Коммерческое предложение').trim().slice(0, 200),
    validUntil,
    blocksSnapshot: snapshot.blocksSnapshot,
    packages: snapshot.packages,
    mediaSnapshot: snapshot.mediaSnapshot,
    messageText: snapshot.messageTemplate,
    eventSnapshot: snapshot.eventSnapshot,
    clientSnapshot: snapshot.clientSnapshot,
    artistSnapshot: snapshot.artistSnapshot,
  })
  return NextResponse.json({ success: true, data: item }, { status: 201 })
}
