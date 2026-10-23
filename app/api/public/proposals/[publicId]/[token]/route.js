import { getProposalSocialContacts } from '@server/proposalSocialContacts'
import { normalizeProposalAppearance } from '@helpers/proposalAppearance.mjs'
import { NextResponse } from 'next/server'
import Proposals from '@models/Proposals'
import Events from '@models/Events'
import { renderProposalVariables } from '@helpers/proposalContent'
import { isProposalSelectionLocked, isProposalApplicationPending } from '@helpers/proposalWorkflow'
import dbConnect from '@server/dbConnect'
import { isValidProposalToken } from '@server/proposals'
import { sendPushToTenant } from '@server/pushNotifications'
import {
  getProposalBlockContentHtml,
  renderProposalRichTextVariables,
} from '@helpers/proposalRichText'

const error = (message, status = 400, code = 'bad_request') =>
  NextResponse.json({ success: false, error: { code, message } }, { status })

const publicData = async (proposal) => {
  const variables = {
    client: proposal.clientSnapshot || {},
    event: proposal.eventSnapshot || {},
    artist: proposal.artistSnapshot || {},
  }
  const blocks = (proposal.blocksSnapshot || []).map((block) => ({
    ...(block.toObject?.() || block),
    title: renderProposalVariables(block.title || '', variables).text,
    text: renderProposalVariables(block.text || '', variables).text,
    contentHtml: renderProposalRichTextVariables(
      getProposalBlockContentHtml(block),
      variables
    ).html,
  }))
  return {
    id: String(proposal._id),
    title: proposal.title,
    appearance: normalizeProposalAppearance(proposal.appearance, proposal.tenantId),
    version: proposal.version,
    contentRevision: Number(proposal.contentRevision || 0),
    status: proposal.status,
    validUntil: proposal.validUntil,
    blocks,
    packages: proposal.packages,
    media: proposal.mediaSnapshot,
    event: proposal.eventSnapshot,
    client: { firstName: proposal.clientSnapshot?.firstName || '' },
    artist: proposal.artistSnapshot,
    socialContacts: await getProposalSocialContacts(proposal),
    selectedPackageId: proposal.selectedPackageId || '',
    selectedAt: proposal.selectedAt,
    selectionLocked: isProposalSelectionLocked(proposal),
    applicationPending: isProposalApplicationPending(proposal),
    appliedPackageId: proposal.appliedPackageId || '',
    expired: Boolean(
      proposal.validUntil &&
      new Date(proposal.validUntil).getTime() < Date.now()
    ),
  }
}

const findProposal = async (publicId, token) => {
  await dbConnect()
  const proposal = await Proposals.findOne({ publicId })
  if (!proposal || !isValidProposalToken(proposal, token)) return null
  return proposal
}

export const GET = async (_req, { params }) => {
  const { publicId, token } = await params
  const proposal = await findProposal(publicId, token)
  if (!proposal) return error('Предложение не найдено', 404, 'not_found')
  if (proposal.status === 'revoked' || proposal.status === 'draft')
    return error('Предложение недоступно', 410, 'unavailable')
  proposal.viewedAt = new Date()
  proposal.viewCount = Number(proposal.viewCount || 0) + 1
  if (
    proposal.validUntil &&
    new Date(proposal.validUntil).getTime() < Date.now() &&
    proposal.status === 'published'
  ) {
    proposal.status = 'expired'
  }
  await proposal.save()
  return NextResponse.json(
    { success: true, data: await publicData(proposal) },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    }
  )
}

export const POST = async (req, { params }) => {
  const { publicId, token } = await params
  const proposal = await findProposal(publicId, token)
  if (!proposal) return error('Предложение не найдено', 404, 'not_found')
  if (proposal.status !== 'published')
    return error('Выбор недоступен', 410, 'selection_closed')
  if (isProposalSelectionLocked(proposal))
    return error('Выбор закрыт: применение подтверждено или ожидает сверки. Обновите предложение.', 409, 'selection_locked')
  if (
    proposal.validUntil &&
    new Date(proposal.validUntil).getTime() < Date.now()
  ) {
    proposal.status = 'expired'
    await proposal.save()
    return error('Срок действия предложения истёк', 410, 'expired')
  }
  const body = await req.json().catch(() => ({}))
  const action = body?.action ?? 'select'
  if (!['select', 'cancel'].includes(action))
    return error('Неизвестное действие', 400, 'invalid_action')
  const cancel = action === 'cancel'
  const contentRevision = Number(proposal.contentRevision || 0)
  if ((body?.contentRevision ?? 0) !== contentRevision)
    return error('Условия предложения изменились. Обновите страницу и выберите вариант заново.', 409, 'content_changed')
  const packageId = String(body?.packageId || '').trim()
  const selected = proposal.packages.find((item) => item.id === packageId)
  if (!selected) return error('Вариант не найден', 404, 'package_not_found')
  const previous = proposal.selectedPackageId || ''
  const previousSelectedAt = proposal.selectedAt || null
  if (cancel && previous && previous !== packageId)
    return error('Выбор изменился. Обновите предложение.', 409, 'selection_conflict')
  const nextPackageId = cancel ? '' : packageId
  const changed = previous !== nextPackageId
  proposal.selectedPackageId = nextPackageId
  proposal.selectedAt = cancel ? null : changed ? new Date() : proposal.selectedAt || new Date()
  if (changed) {
    proposal.selectionHistory.push({
      packageId: nextPackageId,
      previousPackageId: previous,
      selectedAt: cancel ? new Date() : proposal.selectedAt,
      ...(cancel ? { action: 'cancel' } : {}),
    })
  }
  // Compare-and-set against apply, revocation, token rotation and another selection.
  proposal.$where = {
    status: 'published',
    contentRevision: contentRevision || { $in: [0, null] },
    tenantId: proposal.tenantId,
    publicTokenHash: proposal.publicTokenHash,
    publicTokenNonce: proposal.publicTokenNonce,
    applyOperation: null,
    appliedAt: null,
    appliedPackageId: { $in: ['', null] },
    appliedSelectionAt: null,
    selectedPackageId: { $in: previous ? [previous] : ['', null] },
    selectedAt: previousSelectedAt,
    $or: [{ validUntil: null }, { validUntil: { $gte: new Date() } }],
  }
  try {
    await proposal.save()
  } catch (saveError) {
    if (['DocumentNotFoundError', 'VersionError'].includes(saveError.name))
      return error('Предложение изменилось или больше недоступно. Обновите страницу.', 409, 'selection_conflict')
    throw saveError
  }
  if (changed && !cancel && !proposal.selectionTaskCreatedAt) {
    const event = await Events.findOne({
      _id: proposal.eventId,
      tenantId: proposal.tenantId,
    })
    if (event) {
      event.additionalEvents.push({
        title: `Связаться с клиентом: выбран вариант «${selected.title}»`,
        description: `Клиент выбрал коммерческое предложение версии ${proposal.version}.`,
        date: new Date(),
        done: false,
      })
      event.syncVersion = Number(event.syncVersion || 1) + 1
      await event.save()
      proposal.selectionTaskCreatedAt = new Date()
      // Only persist the task marker: apply may have locked the selection since
      // its successful save. Never save a stale selection document a second time.
      await Proposals.updateOne(
        { _id: proposal._id, tenantId: proposal.tenantId, selectionTaskCreatedAt: null },
        { $set: { selectionTaskCreatedAt: proposal.selectionTaskCreatedAt } }
      )
    }
  }
  if (changed) {
    await sendPushToTenant({
      tenantId: proposal.tenantId,
      source: 'proposal-selection',
      payload: {
        title: cancel ? 'Клиент отменил выбор предложения' : 'Клиент выбрал предложение',
        body: cancel ? `Отменён выбор варианта «${selected.title}»` : `Выбран вариант «${selected.title}»`,
        tag: `proposal-${proposal._id}`,
        data: {
          type: 'proposal_selected',
          eventId: String(proposal.eventId),
          proposalId: String(proposal._id),
          url: `/event/${proposal.eventId}`,
        },
      },
    }).catch(() => null)
  }
  return NextResponse.json({
    success: true,
    data: await publicData(proposal),
    changed,
  })
}
