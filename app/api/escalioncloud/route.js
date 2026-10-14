import { NextResponse } from 'next/server'
import getRequestContext from '@server/getRequestContext'
import { uploadFilesToEscalionCloud } from '@server/escalionCloud'
import mongoose from 'mongoose'
import Proposals from '@models/Proposals'
import ProposalTemplates from '@models/ProposalTemplates'
import Events from '@models/Events'
import Users from '@models/Users'
import News from '@models/News'
import { validateUploadFiles } from '@server/validatedUploadFiles'
import dbConnect from '@server/dbConnect'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { resolveUploadedFileUrl } from '@helpers/escalionCloudUpload.mjs'
import { canUseProposalBuilder } from '@helpers/proposalAccess'

export const runtime = 'nodejs'

const buildError = (type, message) => ({
  success: false,
  data: {
    error: {
      type,
      message,
    },
  },
})

export async function POST(request) {
  const authorization = request?.headers?.get?.('authorization')
  if (authorization != null && !/^Bearer [^\s,]+$/.test(authorization)) return NextResponse.json(buildError('UNAUTHORIZED', 'Unauthorized'), { status: 401 })
  const { user, tenantId } = await getRequestContext(request)
  if (!user?._id || !tenantId || !mongoose.Types.ObjectId.isValid(tenantId)) {
    return NextResponse.json(buildError('UNAUTHORIZED', 'Unauthorized'), {
      status: 401,
    })
  }

  if (!process.env.ESCALIONCLOUD_PASSWORD) {
    return NextResponse.json(
      buildError(
        'CONFIG_ERROR',
        'ESCALIONCLOUD_PASSWORD is not configured on the server'
      ),
      { status: 500 }
    )
  }

  try {
    const incomingFormData = await request.formData()
    const files = incomingFormData.getAll('files')
    const directoryRaw = incomingFormData.get('directory')
    const project = incomingFormData.get('project')
    const folder = incomingFormData.get('folder')
    // Exactly one contract; never normalize traversal or decode client paths.
    const ambiguous = ['directory', 'project', 'folder'].some(
      (key) => incomingFormData.getAll(key).length > 1
    ) || (directoryRaw != null && (project != null || folder != null))
    const targetPath = directoryRaw ?? (
      project === 'artistcrm' && typeof folder === 'string'
        ? `artistcrm/${folder}`
        : ''
    )
    const safePath = !ambiguous && typeof targetPath === 'string' &&
      /^[a-zA-Z0-9/-]+$/.test(targetPath) &&
      targetPath.split('/').every((part) => part && part !== '.' && part !== '..')
    const proposal = safePath && targetPath.match(/^(?:artistcrm\/)?(proposals|proposal-templates)\/([a-zA-Z0-9-]+)$/)
    const legacyImage = safePath && /^(?:artistcrm\/)(users|services)$/.test(targetPath)
    const news = safePath && targetPath.match(/^artistcrm\/news\/(draft|[a-f0-9]{24})$/i)
    const mobile = safePath && targetPath === `artistcrm/${tenantId}/mobile`
    const avatar = safePath && targetPath === `artistcrm/${tenantId}/mobile/profile`
    let directory
    if (!files.length) {
      return NextResponse.json(
        buildError('VALIDATION_ERROR', 'No files provided for upload'),
        { status: 400 }
      )
    }

    if (!(proposal || legacyImage || news || mobile || avatar))
      return NextResponse.json(buildError('VALIDATION_ERROR', 'Некорректное назначение загрузки'), { status: 400 })

    if (proposal) {
      const [, kind, id] = proposal
      if (!canUseProposalBuilder(await getUserTariffAccess(user._id)))
        return NextResponse.json(buildError('FORBIDDEN', 'Коммерческие предложения недоступны на текущем тарифе'), { status: 403 })
      await dbConnect()
      if (mongoose.Types.ObjectId.isValid(id)) {
        const model = kind === 'proposals' ? Proposals : ProposalTemplates
        const item = await model.findOne({ _id: id, tenantId }).lean()
        if (!item)
          return NextResponse.json(buildError('NOT_FOUND', 'Предложение или шаблон не найден'), { status: 404 })
        if (kind === 'proposals') {
          if (item.status !== 'draft')
            return NextResponse.json(buildError('CONFLICT', 'Опубликованный снимок нельзя редактировать'), { status: 409 })
          if (!(await Events.exists({ _id: item.eventId, tenantId })))
            return NextResponse.json(buildError('NOT_FOUND', 'Работа не найдена'), { status: 404 })
        }
      } else if (kind !== 'proposal-templates' || !/^(?:draft|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(id)) {
        return NextResponse.json(buildError('VALIDATION_ERROR', 'Некорректный ID медиа КП'), { status: 400 })
      }
      directory = `artistcrm/${tenantId}/${kind}/${id}`
    } else if (news) {
      if (user.role !== 'dev')
        return NextResponse.json(buildError('FORBIDDEN', 'Недостаточно прав'), { status: 403 })
      await dbConnect()
      if (news[1] !== 'draft' && !(await News.exists({ _id: news[1] })))
        return NextResponse.json(buildError('NOT_FOUND', 'Новость не найдена'), { status: 404 })
      directory = `artistcrm/news/${news[1]}`
    } else {
      await dbConnect()
      const owner = await Users.findOne({
        _id: user._id,
        archive: { $ne: true },
        $or: [{ tenantId }, { _id: tenantId, tenantId: null }],
      }).lean()
      if (!owner || owner.archive || String(owner._id) !== String(user._id) || String(owner.tenantId || owner._id) !== String(tenantId))
        return NextResponse.json(buildError('NOT_FOUND', 'Профиль не найден'), { status: 404 })
      directory = mobile || avatar
        ? `artistcrm/${tenantId}/mobile${avatar ? '/profile' : ''}`
        : `artistcrm/${targetPath === 'artistcrm/users' ? 'users' : 'services'}`
    }

    const validated = await validateUploadFiles(files, {
      generic: Boolean(mobile || avatar),
      imageOnly: Boolean(legacyImage || news || avatar),
    })
    if (!validated)
      return NextResponse.json(buildError('VALIDATION_ERROR', 'Некорректный файл. Картинки до 10 МБ, видео MP4/WebM до 50 МБ; mobile-файл до 5 МБ'), { status: 400 })

    const upstreamBody = await uploadFilesToEscalionCloud({ files: validated, directory })
    const proposalMedia = /^artistcrm\/[^/]+\/(?:proposals|proposal-templates)\//.test(directory)
    const mediaUrl = proposalMedia ? resolveUploadedFileUrl(upstreamBody, { directory: directory.replace(/^artistcrm\//, ''), project: 'artistcrm' }) : ''
    if (proposalMedia && !mediaUrl) return NextResponse.json(buildError('UPLOAD_ERROR', 'Хранилище не вернуло адрес файла'), { status: 502 })

    return NextResponse.json({
      success: true,
      data: proposalMedia ? { files: upstreamBody, url: mediaUrl } : upstreamBody,
    })
  } catch {
    return NextResponse.json(
      buildError(
        'INTERNAL_ERROR',
        'Unexpected error while uploading to EscalionCloud'
      ),
      { status: 500 }
    )
  }
}
