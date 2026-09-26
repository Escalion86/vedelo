import mongoose from 'mongoose'
import { NextResponse } from 'next/server'
import Proposals from '@models/Proposals'
import Events from '@models/Events'
import Services from '@models/Services'
import { buildAgreedProposal } from '@helpers/proposalWorkflow'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import {
  canUseProposalBuilder,
  PROPOSAL_BUILDER_ACCESS_ERROR,
} from '@helpers/proposalAccess'
import {
  normalizeProposalBlocks,
  normalizeProposalMedia,
  normalizeProposalPackages,
  getProposalUnknownVariables,
} from '@helpers/proposalContent'
import {
  buildProposalPublicUrl,
  createProposalPublicCredentials,
  renderProposalMessage,
} from '@server/proposals'

const error = (message, status = 400, code = 'bad_request') =>
  NextResponse.json({ success: false, error: { code, message } }, { status })

const authorize = async (id) => {
  const context = await getTenantContext()
  if (!context.tenantId || !context.user?._id)
    return { response: error('Не авторизован', 401, 'unauthorized') }
  if (!mongoose.Types.ObjectId.isValid(id))
    return { response: error('Некорректный ID', 400, 'bad_id') }
  if (!canUseProposalBuilder(context.user))
    return {
      response: error(
        PROPOSAL_BUILDER_ACCESS_ERROR,
        403,
        'developer_preview_only'
      ),
    }
  await dbConnect()
  const proposal = await Proposals.findOne({
    _id: id,
    tenantId: context.tenantId,
  })
  if (!proposal)
    return { response: error('Предложение не найдено', 404, 'not_found') }
  return { context, proposal }
}

const serialize = (proposal, req) => {
  const data = proposal.toJSON?.() ?? proposal
  if (
    !proposal.publicId ||
    !proposal.publicTokenNonce ||
    !proposal.publicTokenHash
  )
    return data
  const origin = process.env.DOMAIN || req.nextUrl.origin
  const publicUrl = buildProposalPublicUrl(proposal, origin)
  return {
    ...data,
    publicUrl,
    renderedMessage: renderProposalMessage(proposal, publicUrl),
  }
}

export const GET = async (req, { params }) => {
  const { id } = await params
  const auth = await authorize(id)
  if (auth.response) return auth.response
  return NextResponse.json({
    success: true,
    data: serialize(auth.proposal, req),
  })
}

export const PATCH = async (req, { params }) => {
  const { id } = await params
  const auth = await authorize(id)
  if (auth.response) return auth.response
  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || '').trim()
  let appliedEvent = null

  if (action === 'publish') {
    if (!auth.proposal.packages?.length)
      return error('Добавьте хотя бы один вариант', 400, 'packages_required')
    if (!auth.proposal.publicTokenHash) {
      const credentials = createProposalPublicCredentials(auth.proposal._id)
      auth.proposal.publicId = credentials.publicId
      auth.proposal.publicTokenNonce = credentials.nonce
      auth.proposal.publicTokenHash = credentials.tokenHash
    }
    const previewUrl = buildProposalPublicUrl(
      auth.proposal,
      process.env.DOMAIN || req.nextUrl.origin
    )
    if (!auth.proposal.validUntil || new Date(auth.proposal.validUntil) <= new Date()) return error('Укажите будущий срок действия', 400, 'expired')
    const unresolved = getProposalUnknownVariables({
      blocks: auth.proposal.blocksSnapshot.filter((block) => block.enabled !== false),
      messageText: auth.proposal.messageText,
      variables: { proposal: { url: previewUrl }, client: auth.proposal.clientSnapshot, event: auth.proposal.eventSnapshot, artist: auth.proposal.artistSnapshot },
    })
    if (unresolved.length) {
      return error(
        `Заполните переменные: ${unresolved.join(', ')}`,
        400,
        'unknown_variables'
      )
    }
    auth.proposal.status = 'published'
    auth.proposal.publishedAt = auth.proposal.publishedAt || new Date()
    auth.proposal.revokedAt = null
  } else if (action === 'revoke') {
    auth.proposal.status = 'revoked'
    auth.proposal.revokedAt = new Date()
  } else if (action === 'apply') {
    const selected = auth.proposal.packages.find(
      (item) => item.id === auth.proposal.selectedPackageId
    )
    if (!selected)
      return error('Клиент ещё не выбрал вариант', 409, 'selection_required')
    const requestedServiceIds = selected.lines
      .map((line) => line.serviceId)
      .filter((value) => mongoose.Types.ObjectId.isValid(value))
    const tenantServices = requestedServiceIds.length
      ? await Services.find({
          _id: { $in: requestedServiceIds },
          tenantId: auth.context.tenantId,
        })
          .select('_id')
          .lean()
      : []
    const serviceIds = tenantServices.map((service) => service._id)
    const event = await Events.findOneAndUpdate(
      { _id: auth.proposal.eventId, tenantId: auth.context.tenantId, status: { $nin: ['closed', 'canceled'] } },
      {
        $set: {
          servicesIds: serviceIds,
          contractSum: Number(selected.total) || 0,
          agreedProposal: buildAgreedProposal(auth.proposal, selected, serviceIds),
        },
        $inc: { syncVersion: 1 },
      },
      { returnDocument: 'after' }
    )
    if (!event) return error('Заказ удалён, закрыт или отменён. Применение недоступно.', 409, 'event_not_available')
    appliedEvent = event
    auth.proposal.appliedAt = new Date()
    auth.proposal.appliedPackageId = selected.id
    auth.proposal.appliedSelectionAt = auth.proposal.selectedAt
  } else {
    if (auth.proposal.status !== 'draft')
      return error(
        'Опубликованный снимок нельзя редактировать',
        409,
        'immutable_snapshot'
      )
    if (body.title !== undefined) {
      const title = String(body.title || '')
        .trim()
        .slice(0, 200)
      if (!title)
        return error('Укажите название предложения', 400, 'title_required')
      auth.proposal.title = title
    }
    if (body.validUntil !== undefined) {
      const date = new Date(body.validUntil)
      if (Number.isNaN(date.getTime()))
        return error('Некорректный срок действия', 400, 'bad_valid_until')
      auth.proposal.validUntil = date
    }
    if (body.blocks !== undefined)
      auth.proposal.blocksSnapshot = normalizeProposalBlocks(body.blocks)
    if (body.packages !== undefined)
      auth.proposal.packages = normalizeProposalPackages(body.packages)
    if (body.media !== undefined)
      auth.proposal.mediaSnapshot = normalizeProposalMedia(body.media)
    if (body.messageText !== undefined)
      auth.proposal.messageText = String(body.messageText || '')
        .trim()
        .slice(0, 4000)
  }
  await auth.proposal.save()
  return NextResponse.json({
    success: true,
    data: serialize(auth.proposal, req),
    ...(appliedEvent ? { event: appliedEvent } : {}),
  })
}

export const DELETE = async (_req, { params }) => {
  const { id } = await params
  const auth = await authorize(id)
  if (auth.response) return auth.response
  if (auth.proposal.status !== 'draft')
    return error('Можно удалить только черновик', 409, 'published')
  await auth.proposal.deleteOne()
  return NextResponse.json({ success: true, data: { id } })
}
