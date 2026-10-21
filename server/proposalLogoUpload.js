import sharp from 'sharp'
import { NextResponse } from 'next/server'
import { isProposalLogoUrl } from '@helpers/proposalAppearance.mjs'
import { uploadFilesToEscalionCloud } from '@server/escalionCloud'

const error = (message, status) =>
  NextResponse.json({ success: false, error: { message } }, { status })

// Вызывается только после проверки tenant, тарифа и владельца сущности.
export async function uploadProposalLogo(req, tenantId, directory) {
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
