import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import { NextResponse } from 'next/server'
import Proposals from '@models/Proposals'
import Events from '@models/Events'
import getProposalRequestContext from '@server/proposalRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { uploadProposalLogo } from '@server/proposalLogoUpload'

export const runtime = 'nodejs'
const error = (message, status) =>
  NextResponse.json({ success: false, error: { message } }, { status })

export const POST = async (req, { params }) => {
  const { user, tenantId } = await getProposalRequestContext(req)
  if (!user?._id || !tenantId) return error('Не авторизован', 401)
  const { id } = await params
  if (!mongoose.Types.ObjectId.isValid(id)) return error('Некорректный ID', 400)
  const proposal = await Proposals.findOne({ _id: id, tenantId }).lean()
  if (!proposal) return error('Предложение не найдено', 404)
  const forNewVersion = req.nextUrl?.searchParams?.get('forNewVersion') === '1'
  if (proposal.status !== 'draft' && !forNewVersion)
    return error('Логотип опубликованного КП нельзя изменить', 409)
  if (!(await Events.exists({ _id: proposal.eventId, tenantId })))
    return error('Мероприятие не найдено', 404)
  const access = await getUserTariffAccess(user._id)
  if (!access?.allowProposals)
    return error('Тариф не поддерживает предложения', 403)
  const directoryId = forNewVersion ? new mongoose.Types.ObjectId().toString() : id
  return uploadProposalLogo(req, tenantId, `vedelo/${tenantId}/proposals/${directoryId}/logos/${randomUUID()}`)
}
