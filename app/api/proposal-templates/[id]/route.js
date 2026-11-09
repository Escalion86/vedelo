import { normalizeProposalAppearance } from '@helpers/proposalAppearance.mjs'
import { deleteCreatedResource } from '@server/idempotentResourceCreation'
import getUserTariffAccess from '@server/getUserTariffAccess'
import mongoose from 'mongoose'
import { NextResponse } from 'next/server'
import ProposalTemplates from '@models/ProposalTemplates'
import Proposals from '@models/Proposals'
import Services from '@models/Services'
import dbConnect from '@server/dbConnect'
import getProposalRequestContext from '@server/proposalRequestContext'
import {
  canUseProposalBuilder,
  PROPOSAL_BUILDER_ACCESS_ERROR,
} from '@helpers/proposalAccess'
import {
  materializeProposalTemplateDefaults,
  normalizeProposalBlocks,
  normalizeProposalMedia,
  normalizeProposalTemplateDefaults,
  proposalEditorProjection,
} from '@helpers/proposalContent'

const error = (message, status = 400, code = 'bad_request') =>
  NextResponse.json({ success: false, error: { code, message } }, { status })

const authorize = async (req) => {
  const context = await getProposalRequestContext(req)
  if (!context.tenantId || !context.user?._id) return { response: error('Не авторизован', 401, 'unauthorized') }
  if (!canUseProposalBuilder(await getUserTariffAccess(context.user._id)))
    return {
      response: error(
        PROPOSAL_BUILDER_ACCESS_ERROR,
        403,
        'proposal_tariff_required'
      ),
    }
  return { context }
}

export const GET = async (req, { params }) => {
  const auth = await authorize(req)
  if (auth.response) return auth.response
  const { id } = await params
  if (!mongoose.Types.ObjectId.isValid(id)) return error('Некорректный ID', 400, 'bad_id')
  await dbConnect()
  const item = await ProposalTemplates.findOne({ _id: id, tenantId: auth.context.tenantId }).lean()
  if (!item) return error('Шаблон не найден', 404, 'not_found')
  // Шаблоны старого формата отдаём уже с вариантами.
  const services = await Services.find({ tenantId: auth.context.tenantId })
    .sort({ index: 1 })
    .lean()
  return NextResponse.json({
    success: true,
    data: {
      ...item,
      contentRevision: item.contentRevision ?? 0,
      ...proposalEditorProjection(item.blocks),
      defaults: materializeProposalTemplateDefaults(item.defaults, services),
    },
  })
}

export const PATCH = async (req, { params }) => {
  const auth = await authorize(req)
  if (auth.response) return auth.response
  const { id } = await params
  if (!mongoose.Types.ObjectId.isValid(id)) return error('Некорректный ID', 400, 'bad_id')
  const body = await req.json().catch(() => ({}))
  const update = {}
  const revision = body?.contentRevision
  if (revision !== undefined && (!Number.isInteger(revision) || revision < 0)) return error('Некорректная ревизия', 400, 'bad_revision')
  if (body.name !== undefined) update.name = String(body.name || '').trim().slice(0, 160)
  if (body.status !== undefined) update.status = body.status === 'archived' ? 'archived' : 'active'
  if (body.blocks !== undefined) update.blocks = normalizeProposalBlocks(body.blocks)
  if (body.messageTemplate !== undefined) update.messageTemplate = String(body.messageTemplate || '').trim().slice(0, 4000)
  if (body.appearance !== undefined) update.appearance = normalizeProposalAppearance(body.appearance, auth.context.tenantId)
  if (body.media !== undefined) update.media = normalizeProposalMedia(body.media)
  if (body.defaults !== undefined) update.defaults = normalizeProposalTemplateDefaults(body.defaults)
  if (update.name === '') return error('Укажите название шаблона', 400, 'name_required')
  await dbConnect()
  const filter = { _id: id, tenantId: auth.context.tenantId }
  const item = await ProposalTemplates.findOneAndUpdate(
    { ...filter, ...(revision === undefined ? {} : { contentRevision: revision === 0 ? { $in: [0, null] } : revision }) },
    { $set: update, $inc: { contentRevision: 1 } },
    { returnDocument: 'after' }
  )
  if (!item) {
    if (revision !== undefined && await ProposalTemplates.exists(filter)) return error('Шаблон изменился. Откройте актуальную версию.', 409, 'revision_conflict')
    return error('Шаблон не найден', 404, 'not_found')
  }
  // Match GET for legacy templates whose packages are materialized from the
  // service catalogue. A partial title/appearance edit must not rewrite them.
  const services = await Services.find({ tenantId: auth.context.tenantId })
    .sort({ index: 1 })
    .lean()
  return NextResponse.json({ success: true, data: {
    ...(item.toObject?.() ?? item),
    ...proposalEditorProjection(item.blocks),
    defaults: materializeProposalTemplateDefaults(item.defaults, services),
  } })
}

export const DELETE = async (req, { params }) => {
  const auth = await authorize(req)
  if (auth.response) return auth.response
  const { id } = await params
  if (!mongoose.Types.ObjectId.isValid(id)) return error('Некорректный ID', 400, 'bad_id')
  await dbConnect()
  const used = await Proposals.exists({ tenantId: auth.context.tenantId, templateId: id })
  if (used) {
    const item = await ProposalTemplates.findOneAndUpdate(
      { _id: id, tenantId: auth.context.tenantId },
      { $set: { status: 'archived' }, $inc: { contentRevision: 1 } },
      { returnDocument: 'after' }
    )
    return NextResponse.json({ success: true, data: item, archived: true })
  }
  const item = await deleteCreatedResource(ProposalTemplates, { _id: id, tenantId: auth.context.tenantId })
  if (!item) return error('Шаблон не найден', 404, 'not_found')
  return NextResponse.json({ success: true, data: { id } })
}
