import getUserTariffAccess from '@server/getUserTariffAccess'
import mongoose from 'mongoose'
import { NextResponse } from 'next/server'
import ProposalTemplates from '@models/ProposalTemplates'
import Proposals from '@models/Proposals'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import {
  canUseProposalBuilder,
  PROPOSAL_BUILDER_ACCESS_ERROR,
} from '@helpers/proposalAccess'
import {
  normalizeProposalBlocks,
  normalizeProposalMedia,
  normalizeProposalTemplateDefaults,
} from '@helpers/proposalContent'

const error = (message, status = 400, code = 'bad_request') =>
  NextResponse.json({ success: false, error: { code, message } }, { status })

const authorize = async () => {
  const context = await getTenantContext()
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

export const GET = async (_req, { params }) => {
  const auth = await authorize()
  if (auth.response) return auth.response
  const { id } = await params
  if (!mongoose.Types.ObjectId.isValid(id)) return error('Некорректный ID', 400, 'bad_id')
  await dbConnect()
  const item = await ProposalTemplates.findOne({ _id: id, tenantId: auth.context.tenantId }).lean()
  if (!item) return error('Шаблон не найден', 404, 'not_found')
  return NextResponse.json({ success: true, data: item })
}

export const PATCH = async (req, { params }) => {
  const auth = await authorize()
  if (auth.response) return auth.response
  const { id } = await params
  if (!mongoose.Types.ObjectId.isValid(id)) return error('Некорректный ID', 400, 'bad_id')
  const body = await req.json().catch(() => ({}))
  const update = {}
  if (body.name !== undefined) update.name = String(body.name || '').trim().slice(0, 160)
  if (body.status !== undefined) update.status = body.status === 'archived' ? 'archived' : 'active'
  if (body.blocks !== undefined) update.blocks = normalizeProposalBlocks(body.blocks)
  if (body.messageTemplate !== undefined) update.messageTemplate = String(body.messageTemplate || '').trim().slice(0, 4000)
  if (body.media !== undefined) update.media = normalizeProposalMedia(body.media)
  if (body.defaults !== undefined) update.defaults = normalizeProposalTemplateDefaults(body.defaults)
  if (update.name === '') return error('Укажите название шаблона', 400, 'name_required')
  await dbConnect()
  const item = await ProposalTemplates.findOneAndUpdate(
    { _id: id, tenantId: auth.context.tenantId },
    { $set: update },
    { returnDocument: 'after' }
  )
  if (!item) return error('Шаблон не найден', 404, 'not_found')
  return NextResponse.json({ success: true, data: item })
}

export const DELETE = async (_req, { params }) => {
  const auth = await authorize()
  if (auth.response) return auth.response
  const { id } = await params
  if (!mongoose.Types.ObjectId.isValid(id)) return error('Некорректный ID', 400, 'bad_id')
  await dbConnect()
  const used = await Proposals.exists({ tenantId: auth.context.tenantId, templateId: id })
  if (used) {
    const item = await ProposalTemplates.findOneAndUpdate(
      { _id: id, tenantId: auth.context.tenantId },
      { $set: { status: 'archived' } },
      { returnDocument: 'after' }
    )
    return NextResponse.json({ success: true, data: item, archived: true })
  }
  const item = await ProposalTemplates.findOneAndDelete({ _id: id, tenantId: auth.context.tenantId })
  if (!item) return error('Шаблон не найден', 404, 'not_found')
  return NextResponse.json({ success: true, data: { id } })
}
