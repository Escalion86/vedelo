import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import { NextResponse } from 'next/server'
import ProposalTemplates from '@models/ProposalTemplates'
import dbConnect from '@server/dbConnect'
import getProposalRequestContext from '@server/proposalRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { canUseProposalBuilder } from '@helpers/proposalAccess'
import { uploadProposalLogo } from '@server/proposalLogoUpload'

export const runtime = 'nodejs'
const error = (message, status) =>
  NextResponse.json({ success: false, error: { message } }, { status })

export async function POST(req, { params }) {
  const { user, tenantId } = await getProposalRequestContext(req)
  if (!user?._id || !tenantId) return error('Не авторизован', 401)
  if (!canUseProposalBuilder(await getUserTariffAccess(user._id)))
    return error('Тариф не поддерживает предложения', 403)
  const { id } = await params
  if (id !== 'new') {
    if (!mongoose.Types.ObjectId.isValid(id)) return error('Некорректный ID', 400)
    await dbConnect()
    if (!(await ProposalTemplates.exists({ _id: id, tenantId })))
      return error('Шаблон не найден', 404)
  }
  // Новый шаблон ещё не сохранён; каталог назначает сервер в tenant пользователя.
  const directoryId = id === 'new' ? new mongoose.Types.ObjectId().toString() : id
  return uploadProposalLogo(req, tenantId,
    `vedelo/${tenantId}/proposal-templates/${directoryId}/logos/${randomUUID()}`)
}
