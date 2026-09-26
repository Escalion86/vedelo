import { NextResponse } from 'next/server'
import Proposals from '@models/Proposals'
import Events from '@models/Events'
import { renderProposalVariables } from '@helpers/proposalContent'
import dbConnect from '@server/dbConnect'
import { isValidProposalToken } from '@server/proposals'
import { sendPushToTenant } from '@server/pushNotifications'
import {
  getProposalBlockContentHtml,
  renderProposalRichTextVariables,
} from '@helpers/proposalRichText'

const error = (message, status = 400, code = 'bad_request') =>
  NextResponse.json({ success: false, error: { code, message } }, { status })

const publicData = (proposal) => {
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
    version: proposal.version,
    status: proposal.status,
    validUntil: proposal.validUntil,
    blocks,
    packages: proposal.packages,
    media: proposal.mediaSnapshot,
    event: proposal.eventSnapshot,
    client: { firstName: proposal.clientSnapshot?.firstName || '' },
    artist: proposal.artistSnapshot,
    selectedPackageId: proposal.selectedPackageId || '',
    selectedAt: proposal.selectedAt,
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
    { success: true, data: publicData(proposal) },
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
  if (
    proposal.validUntil &&
    new Date(proposal.validUntil).getTime() < Date.now()
  ) {
    proposal.status = 'expired'
    await proposal.save()
    return error('Срок действия предложения истёк', 410, 'expired')
  }
  const body = await req.json().catch(() => ({}))
  const packageId = String(body?.packageId || '').trim()
  const selected = proposal.packages.find((item) => item.id === packageId)
  if (!selected) return error('Вариант не найден', 404, 'package_not_found')
  const previous = proposal.selectedPackageId || ''
  const changed = previous !== packageId
  proposal.selectedPackageId = packageId
  proposal.selectedAt = changed ? new Date() : proposal.selectedAt || new Date()
  if (changed) {
    proposal.selectionHistory.push({
      packageId,
      previousPackageId: previous,
      selectedAt: proposal.selectedAt,
    })
  }
  if (changed && !proposal.selectionTaskCreatedAt) {
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
    }
  }
  await proposal.save()
  if (changed) {
    await sendPushToTenant({
      tenantId: proposal.tenantId,
      source: 'proposal-selection',
      payload: {
        title: 'Клиент выбрал предложение',
        body: `Выбран вариант «${selected.title}»`,
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
    data: publicData(proposal),
    changed,
  })
}
