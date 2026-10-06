import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { NextResponse } from 'next/server'
import getTenantContext from '@server/getTenantContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { uploadFilesToEscalionCloud } from '@server/escalionCloud'
import { isReviewLogoUrl } from '@helpers/reviewAppearance.mjs'

export const runtime = 'nodejs'

const error = (message, status) =>
  NextResponse.json({ success: false, error: message }, { status })

const MAX_FILE_SIZE = 5 * 1024 * 1024

export const POST = async (req) => {
  const { user, tenantId } = await getTenantContext()
  if (!user?._id || !tenantId) return error('Не авторизован', 401)
  const access = await getUserTariffAccess(user._id)
  if (!access?.allowClientReviews)
    return error('Публичная страница отзывов доступна на тарифе с отзывами', 403)
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File) || !file.size)
    return error('Выберите изображение', 400)
  if (file.size > MAX_FILE_SIZE)
    return error('Изображение не должно превышать 5 МБ', 413)
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
        height: 640,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer()
  } catch {
    return error('Не удалось прочитать изображение', 400)
  }
  try {
    const directory = `vedelo/${tenantId}/review-page/logo/${randomUUID()}`
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
    if (!isReviewLogoUrl(url, tenantId))
      return error('Хранилище вернуло некорректную ссылку', 502)
    return NextResponse.json({ success: true, data: { url } })
  } catch {
    return error('Не удалось загрузить изображение. Повторите попытку', 502)
  }
}
