import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import sharp from 'sharp'
import { NextResponse } from 'next/server'
import Proposals from '@models/Proposals'
import Events from '@models/Events'
import getTenantContext from '@server/getTenantContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { isProposalLogoUrl } from '@helpers/proposalAppearance.mjs'
import { uploadFilesToEscalionCloud } from '@server/escalionCloud'

export const runtime = 'nodejs'
const error = (message, status) =>
  NextResponse.json({ success: false, error: { message } }, { status })

export const POST = async (req, { params }) => {
  const { user, tenantId } = await getTenantContext()
  if (!user?._id || !tenantId) return error('Не авторизован', 401)
  const { id } = await params
  if (!mongoose.Types.ObjectId.isValid(id)) return error('Некорректный ID', 400)
  const proposal = await Proposals.findOne({ _id: id, tenantId }).lean()
  if (!proposal) return error('Предложение не найдено', 404)
  if (proposal.status !== 'draft')
    return error('Логотип опубликованного КП нельзя изменить', 409)
  if (!(await Events.exists({ _id: proposal.eventId, tenantId })))
    return error('Мероприятие не найдено', 404)
  const access = await getUserTariffAccess(user._id)
  if (!access?.allowProposals)
    return error('Тариф не поддерживает предложения', 403)
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File) || !file.size)
    return error('Выберите изображение', 400)
  if (file.size > 5 * 1024 * 1024)
    return error('Логотип не должен превышать 5 МБ', 413)
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    return error('Разрешены PNG, JPG и WebP', 400)
  let bytes
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 25_000_000,
    })
    const metadata = await image.metadata()
    if (!['png', 'jpeg', 'webp'].includes(metadata.format))
      return error('Некорректный формат изображения', 400)
    bytes = await image
      .rotate()
      .resize({
        width: 640,
        height: 320,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer()
  } catch {
    return error('Не удалось прочитать изображение', 400)
  }
  try {
    const directory = `vedelo/${tenantId}/proposals/${id}/logos/${randomUUID()}`
    const rows = await uploadFilesToEscalionCloud({
      directory,
      files: [new File([bytes], 'logo.webp', { type: 'image/webp' })],
    })
    const row = rows[0]
    const path = row?.path || row?.filePath || ''
    const url =
      (typeof row === 'string' ? row : row?.url || row?.fileUrl) ||
      (path
        ? `https://cloud.escalion.ru/uploads/${String(path).replace(/^\/+/, '')}`
        : '')
    if (!isProposalLogoUrl(url, tenantId))
      return error('Хранилище вернуло некорректную ссылку', 502)
    return NextResponse.json({ success: true, data: { url } })
  } catch {
    return error('Не удалось загрузить логотип. Повторите попытку', 502)
  }
}
