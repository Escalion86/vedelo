import { getProposalSocialContacts } from '@server/proposalSocialContacts'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { applyProposalDraftChanges } from '@server/proposalDraftChanges'
import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { NextResponse } from 'next/server'
import Proposals from '@models/Proposals'
import Events from '@models/Events'
import Services from '@models/Services'
import { buildAgreedProposal, isProposalSelectionLocked } from '@helpers/proposalWorkflow'
import dbConnect from '@server/dbConnect'
import getProposalRequestContext from '@server/proposalRequestContext'
import {
  canUseProposalBuilder,
  PROPOSAL_BUILDER_ACCESS_ERROR,
} from '@helpers/proposalAccess'
import {
  getProposalUnknownVariables,
} from '@helpers/proposalContent'
import {
  buildProposalPublicUrl,
  createProposalPublicCredentials,
  renderProposalMessage,
} from '@server/proposals'

const error = (message, status = 400, code = 'bad_request') =>
  NextResponse.json({ success: false, error: { code, message } }, { status })

const authorize = async (req, id) => {
  const context = await getProposalRequestContext(req)
  if (!context.tenantId || !context.user?._id)
    return { response: error('Не авторизован', 401, 'unauthorized') }
  if (!mongoose.Types.ObjectId.isValid(id))
    return { response: error('Некорректный ID', 400, 'bad_id') }
  if (!canUseProposalBuilder(await getUserTariffAccess(context.user._id)))
    return {
      response: error(
        PROPOSAL_BUILDER_ACCESS_ERROR,
        403,
        'proposal_tariff_required'
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

const serialize = async (proposal, req) => {
  const data = { ...(proposal.toJSON?.() ?? proposal), socialContacts: await getProposalSocialContacts(proposal) }
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
  const auth = await authorize(req, id)
  if (auth.response) return auth.response
  return NextResponse.json({
    success: true,
    data: await serialize(auth.proposal, req),
  })
}

export const PATCH = async (req, { params }) => {
  const { id } = await params
  const auth = await authorize(req, id)
  if (auth.response) return auth.response
  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || '').trim()

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
      blocks: auth.proposal.blocksSnapshot,
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
    const revoked = await Proposals.findOneAndUpdate(
      { _id: id, tenantId: auth.context.tenantId, status: 'published', selectedPackageId: { $in: ['', null] } },
      { $set: { status: 'revoked', revokedAt: new Date() } },
      { returnDocument: 'after' }
    )
    if (!revoked)
      return error('Принятое клиентом или уже недоступное предложение нельзя отозвать', 409, 'revoke_unavailable')
    return NextResponse.json({ success: true, data: await serialize(revoked, req) })
  } else if (action === 'apply') {
    // Confirmed historical markers are never auto-repaired. A pending operation
    // is different: the authenticated owner can reconcile only its frozen write.
    const pending = auth.proposal.applyOperation
    if (!pending && isProposalSelectionLocked(auth.proposal))
      return error('Это предложение уже утверждено. Для новых условий создайте новую версию.', 409, 'selection_locked')
    const selected = auth.proposal.packages.find(
      (item) => item.id === auth.proposal.selectedPackageId
    )
    if (!selected)
      return error('Клиент ещё не выбрал вариант', 409, 'selection_required')
    let operation = pending?.toObject?.({ minimize: false }) || pending
    if (!operation) {
      const before = await Events.findOne({
        _id: auth.proposal.eventId,
        tenantId: auth.context.tenantId,
        status: { $nin: ['closed', 'canceled'] },
      }).lean()
      if (!before)
        return error('Заказ удалён, закрыт или отменён. Применение недоступно.', 409, 'event_not_available')
      const requestedServiceIds = selected.lines
        .map((line) => line.serviceId)
        .filter((value) => mongoose.Types.ObjectId.isValid(value))
      const services = requestedServiceIds.length
        ? await Services.find({ _id: { $in: requestedServiceIds }, tenantId: auth.context.tenantId }).select('_id').lean()
        : []
      const serviceIds = services.map((service) => String(service._id))
      operation = {
        id: randomUUID(),
        state: 'pending',
        eventId: String(auth.proposal.eventId),
        packageId: selected.id,
        selectedAt: auth.proposal.selectedAt || null,
        startedAt: new Date(),
        servicesIds: serviceIds,
        eventGuard: {
          syncVersion: before.syncVersion ?? null,
          updatedAt: before.updatedAt || null,
          status: before.status,
          contractSum: before.contractSum ?? null,
          servicesIds: (before.servicesIds || []).map(String),
          agreedProposal: before.agreedProposal ?? null,
        },
        agreement: buildAgreedProposal(auth.proposal, selected, serviceIds),
      }
      const claimed = await Proposals.findOneAndUpdate(
        {
          _id: id,
          tenantId: auth.context.tenantId,
          status: auth.proposal.status,
          selectedPackageId: selected.id,
          selectedAt: auth.proposal.selectedAt || null,
          applyOperation: null,
          appliedAt: null,
          appliedPackageId: { $in: ['', null] },
          appliedSelectionAt: null,
        },
        { $set: { applyOperation: operation } },
        { returnDocument: 'after', runValidators: true }
      )
      if (!claimed)
        return error('Выбор уже изменился или утверждён. Обновите предложение.', 409, 'selection_conflict')
      operation = claimed.applyOperation?.toObject?.({ minimize: false }) || claimed.applyOperation
    }
    const same = (left, right) => isDeepStrictEqual(JSON.parse(JSON.stringify(left)), JSON.parse(JSON.stringify(right)))
    const guard = operation.eventGuard
    // Unknown/incomplete reservations stay locked. Never guess a replacement
    // selection, recalculate services, or overwrite an order on a blind retry.
    if (!operation.id || !['pending', 'confirmed'].includes(operation.state) || !operation.startedAt || !guard ||
        !Array.isArray(operation.servicesIds) || !Array.isArray(guard.servicesIds) ||
        ['closed', 'canceled'].includes(guard.status) || !guard.status ||
        operation.eventId !== String(auth.proposal.eventId) ||
        operation.packageId !== selected.id ||
        !same(operation.selectedAt || null, auth.proposal.selectedAt || null) ||
        !same(operation.agreement || null, buildAgreedProposal(auth.proposal, selected, operation.servicesIds)) ||
        (guard.agreedProposal != null && (typeof guard.agreedProposal !== 'object' || Array.isArray(guard.agreedProposal))))
      return error('Незавершённое применение требует сверки. Выбор остаётся закрытым.', 409, 'application_conflict')
    const agreement = {
      ...(guard.agreedProposal || {}),
      ...operation.agreement,
      applyOperationId: operation.id,
    }
    const expectedVersion = (guard.syncVersion || 0) + 1
    const exactEvent = (event) => {
      const writtenAt = event?.agreedProposal?.applyOperationWrittenAt
      return event && writtenAt &&
        new Date(writtenAt).getTime() >= new Date(operation.startedAt).getTime() &&
        String(event.tenantId) === String(auth.context.tenantId) &&
        event.status === guard.status && event.syncVersion === expectedVersion &&
        same(event.updatedAt || null, writtenAt) &&
        event.contractSum === operation.agreement.total &&
        same((event.servicesIds || []).map(String), operation.servicesIds) &&
        same(event.agreedProposal || null, { ...agreement, applyOperationWrittenAt: writtenAt })
    }
    const readEvent = () => Events.findOne({ _id: auth.proposal.eventId, tenantId: auth.context.tenantId }).lean()
    let event = await readEvent()
    if (!exactEvent(event) && operation.state === 'pending') {
      // Full CAS on the captured order version and the affected fields. The opID
      // in agreedProposal also makes simultaneous retries mutually exclusive.
      // Store the winning write time with the opID. A delayed retry must not
      // backdate updatedAt to reservation time and disappear from sync cursors.
      const writtenAt = new Date()
      await Events.findOneAndUpdate(
        { _id: auth.proposal.eventId, tenantId: auth.context.tenantId, ...guard },
        {
          $set: { servicesIds: operation.servicesIds, contractSum: operation.agreement.total,
            agreedProposal: { ...agreement, applyOperationWrittenAt: writtenAt }, updatedAt: writtenAt },
          $inc: { syncVersion: 1 },
        },
        { returnDocument: 'after', timestamps: false }
      )
      event = await readEvent()
    }
    if (!exactEvent(event))
      return error('Заказ изменился. Нужна сверка незавершённого применения; повтор не меняет новые данные.', 409, 'application_conflict')
    const appliedAt = new Date(event.updatedAt)
    const completed = operation.state === 'pending' ? await Proposals.findOneAndUpdate(
      { _id: id, tenantId: auth.context.tenantId, 'applyOperation.id': operation.id, 'applyOperation.state': 'pending',
        selectedPackageId: operation.packageId, selectedAt: operation.selectedAt || null,
        appliedAt: null, appliedPackageId: { $in: ['', null] }, appliedSelectionAt: null },
      { $set: { appliedAt, appliedPackageId: operation.packageId,
        appliedSelectionAt: operation.selectedAt || null, applyOperation: { ...operation, state: 'confirmed' } } },
      { returnDocument: 'after' }
    ) : null
    // Another retry can have finalized this same operation. Success requires a
    // fresh exact order snapshot AND the matching confirmed proposal, not a flag.
    const confirmed = completed || await Proposals.findOne({ _id: id, tenantId: auth.context.tenantId })
    event = await readEvent()
    if (!exactEvent(event) && operation.state === 'pending') {
      // An order edit crossed proposal finalization. Restore only this known
      // operation to reconciliation, never release the selection or touch Events.
      await Proposals.updateOne(
        { _id: id, tenantId: auth.context.tenantId, 'applyOperation.id': operation.id,
          'applyOperation.state': 'confirmed', appliedAt,
          appliedPackageId: operation.packageId, appliedSelectionAt: operation.selectedAt || null },
        { $set: { appliedAt: null, appliedPackageId: '', appliedSelectionAt: null,
          applyOperation: { ...operation, state: 'pending' } } }
      )
    }
    if (!exactEvent(event) || !confirmed || confirmed.applyOperation?.id !== operation.id ||
        confirmed.applyOperation?.state !== 'confirmed' ||
        confirmed.selectedPackageId !== operation.packageId ||
        !same(confirmed.selectedAt || null, operation.selectedAt || null) ||
        confirmed.appliedPackageId !== operation.packageId ||
        !same(confirmed.appliedAt || null, appliedAt) ||
        !same(confirmed.appliedSelectionAt || null, operation.selectedAt || null))
      return error('Не удалось подтвердить применение. Нужна сверка заказа.', 409, 'application_conflict')
    return NextResponse.json({ success: true, data: await serialize(confirmed, req), event })
  } else {
    if (auth.proposal.status !== 'draft')
      return error(
        'Опубликованный снимок нельзя редактировать',
        409,
        'immutable_snapshot'
      )
    const invalid = applyProposalDraftChanges(auth.proposal, body, auth.context.tenantId)
    if (invalid) return error(invalid.message, invalid.status, invalid.code)
  }
  await auth.proposal.save()
  return NextResponse.json({
    success: true,
    data: await serialize(auth.proposal, req),
  })
}

export const DELETE = async (req, { params }) => {
  const { id } = await params
  const auth = await authorize(req, id)
  if (auth.response) return auth.response
  const deleted = await Proposals.findOneAndDelete({
    _id: id,
    tenantId: auth.context.tenantId,
  })
  if (!deleted)
    return error('Предложение не найдено', 404, 'not_found')
  return NextResponse.json({ success: true, data: { id } })
}
