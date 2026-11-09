import { z } from 'zod'
import {
  captureProposalIdentity,
  type ProposalOperation,
  type BoundProposalOperation,
} from './identity'
import { proposalOperations, type Outcome } from './operations'
import { assertCreationOwner, beginCreationAttempt, finishCreationAttempt, readCreationAttempt, recordCreatedId, requestCreationCancellation, type CreationAttempt, type CreationKind } from './creationStore'
import { localDataEpoch } from '../../shared/storage/localEntityCoordination'
import { resolveUploadedFileUrl } from './uploadUrl.generated'
import { PROPOSAL_LINES_LIMIT, PROPOSAL_PACKAGES_LIMIT } from './limits'
import { notifyProposalChanges } from './changes'
import { parsePeriodDay } from '../../shared/ui/periodPickerDates'

const statusSchema = z.enum(['accepted', 'sent', 'published', 'expired'])
const expiredSchema = z.object({
  _id: z.string(), eventId: z.string(), title: z.string(),
  validUntil: z.string().nullable().optional(), eventType: z.string().nullable().optional(),
  eventDate: z.string().nullable().optional(),
})
export type ProposalStatus = z.infer<typeof statusSchema>
export type ExpiredProposal = z.infer<typeof expiredSchema>

const lineSchema = z.object({
  serviceId: z.string().default(''),
  title: z.string(),
  description: z.string().default(''),
  price: z.number().nonnegative(),
}).passthrough()
const packageSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().default(''),
  lines: z.array(lineSchema).max(PROPOSAL_LINES_LIMIT),
  total: z.number().nonnegative(),
  manualTotal: z.boolean().default(true),
  recommended: z.boolean().default(false),
}).passthrough()
const blockSchema = z
  .object({
    id: z.string().optional(),
    type: z.string(),
    title: z.string().optional(),
    text: z.string().optional(),
    items: z.array(z.string()).optional(),
    contentHtml: z.string().optional(),
    enabled: z.boolean().optional(),
  })
  .passthrough()
const mediaSchema = z.object({
  id: z.string(),
  kind: z.enum(['image', 'video', 'video_link']),
  url: z.string(),
  title: z.string().optional(),
  fileName: z.string().optional(),
  contentType: z.string().optional(),
  size: z.number().optional(),
}).passthrough()
const appearanceSchema = z.object({
  theme: z.enum(['classic', 'light', 'blue', 'dark']).default('classic'),
  logoUrl: z.string().default(''),
  logoAlignment: z.enum(['left', 'center', 'right']).optional(),
}).passthrough()
const proposalSchema = z.object({
  _id: z.string().min(1),
  eventId: z.string().min(1),
  title: z.string(),
  version: z.number().int().positive(),
  contentRevision: z.number().int().nonnegative().optional(),
  applyOperation: z.object({ id: z.string().optional(), state: z.string().optional() }).nullable().optional(),
  applicationPending: z.boolean().optional(),
  status: z.enum(['draft', 'published', 'expired', 'revoked']),
  packages: z.array(packageSchema).max(PROPOSAL_PACKAGES_LIMIT),
  blocksSnapshot: z.array(blockSchema),
  editorBlocks: z.array(blockSchema).optional(),
  mediaSnapshot: z.array(mediaSchema),
  messageText: z.string().default(''),
  validUntil: z.string().nullable().optional(),
  appearance: appearanceSchema.optional(),
  selectedPackageId: z.string().optional(),
  selectedAt: z.string().nullable().optional(),
  appliedAt: z.string().nullable().optional(),
  appliedPackageId: z.string().optional(),
  appliedSelectionAt: z.string().nullable().optional(),
  sentAt: z.string().nullable().optional(),
  renderedMessage: z.string().optional(),
  publicUrl: z.string().optional(),
  delivery: z
    .array(
      z.object({
        status: z.string(),
        type: z.string().optional(),
        mediaId: z.string().optional(),
      })
    )
    .optional(),
})
const templateSchema = z.object({
  _id: z.string().min(1),
  name: z.string(),
  status: z.enum(['active', 'archived']),
  blocks: z.array(blockSchema),
  editorBlocks: z.array(blockSchema).optional(),
  contentRevision: z.number().int().nonnegative().optional(),
  media: z.array(mediaSchema),
  messageTemplate: z.string(),
  appearance: appearanceSchema.optional(),
  defaults: z.object({
    packages: z.array(packageSchema).max(PROPOSAL_PACKAGES_LIMIT),
    servicesIds: z.array(z.string()).default([]),
  }).passthrough(),
})
const eventSchema = z.object({
  _id: z.string(),
  status: z.enum(['draft', 'active', 'closed', 'canceled']).optional(),
  contractSum: z.number().nullable().optional(),
  servicesIds: z.array(z.string()).default([]),
  agreedProposal: z.record(z.string(), z.unknown()).nullable().optional(),
  syncVersion: z.number().optional(),
  updatedAt: z.string().optional(),
})
export type Proposal = z.infer<typeof proposalSchema>
export type ProposalTemplate = z.infer<typeof templateSchema>
export type ProposalPackage = z.infer<typeof packageSchema>
export type ProposalLine = z.infer<typeof lineSchema>
export type ProposalBlock = z.infer<typeof blockSchema>
export type ProposalMedia = z.infer<typeof mediaSchema>
export type AppliedEvent = z.infer<typeof eventSchema>
export type TemplateDraft = Omit<ProposalTemplate, '_id'>
const pathId = (id: string) => {
  if (!id || /[/?#]/.test(id)) throw new Error('INVALID_ID')
  return encodeURIComponent(id)
}
const data = <T>(schema: z.ZodType<T>, response: unknown): T =>
  schema.parse(
    z.object({ success: z.literal(true), data: z.unknown() }).parse(response)
      .data
  )
export type PickedMedia = {
  uri: string
  name: string
  mimeType?: string
  size?: number
  file?: Blob
}

const createBoundApi = (check: BoundProposalOperation) => {
  const ledger = proposalOperations
  const owner = Symbol('creation-owner'), storeOwner = { identity: check.identity, epoch: localDataEpoch() }
  const restoreCreation = async (kind: CreationKind, target: string) => {
    const attempt = await readCreationAttempt(check, kind, target)
    await check()
    if (attempt && !ledger.get(check.identity, kind, target)?.inflight) ledger.set(check.identity, kind, target, {
      inflight: false, phase: attempt.resultId ? 'known' : 'unknown', id: attempt.resultId, recoverable: true, cancelRequested: attempt.cancelRequested,
    })
    return attempt
  }
  const creationFailed = async (kind: CreationKind, target: string, attempt: CreationAttempt | null, id?: string, previous?: Outcome) => {
    if (!await assertCreationOwner(storeOwner).then(() => true, () => false) || ledger.get(check.identity, kind, target)?.owner !== owner) return
    const persisted = await readCreationAttempt(check, kind, target).catch(() => attempt)
    if (!await assertCreationOwner(storeOwner).then(() => true, () => false) || ledger.get(check.identity, kind, target)?.owner !== owner) return
    if (persisted || id) ledger.set(check.identity, kind, target, {
      inflight: false, phase: id || persisted?.resultId ? 'known' : 'unknown', id: id || persisted?.resultId, recoverable: !!persisted, cancelRequested: persisted?.cancelRequested,
    })
    else if (previous) ledger.set(check.identity, kind, target, { ...previous, inflight: false })
    else ledger.clear(check.identity, kind, target)
  }
  const finishRemovedCreation = async (cause: unknown, kind: CreationKind, target: string, attempt: CreationAttempt | null, id?: string) => {
    const error = cause as { status?: number; code?: string }
    if (!attempt || !(error?.status === 410 && ['created_resource_deleted', 'creation_cancelled'].includes(error.code || '') || id && error?.status === 404 && error.code === 'not_found')) return
    try {
      await check()
      await finishCreationAttempt(check, attempt)
      ledger.clear(check.identity, kind, target)
    } catch (error) {
      await creationFailed(kind, target, attempt, id)
      throw error
    }
    throw new Error(error.code === 'creation_cancelled' ? 'CREATION_CANCELLED' : 'CREATED_RESOURCE_GONE')
  }
  const created = async <T extends { _id: string }>(
    kind: CreationKind,
    target: string,
    input: Record<string, unknown>,
    write: (attempt: CreationAttempt) => Promise<T>,
    read: (id: string) => Promise<T>
  ) => {
    if (ledger.get(check.identity, kind, target)) throw new Error('CREATE_OUTCOME_PENDING')
    ledger.set(check.identity, kind, target, { inflight: true, phase: 'unknown', owner })
    let attempt: CreationAttempt | null = null, id: string | undefined
    try {
      attempt = await beginCreationAttempt(check, kind, target, input)
      const saved = await write(attempt)
      id = saved._id
      await recordCreatedId(storeOwner, attempt, id)
      await check()
      ledger.set(check.identity, kind, target, { inflight: true, phase: 'known', id, recoverable: true, owner })
      const fresh = await read(id)
      await check()
      if (kind === 'create-template' && JSON.stringify(saved) !== JSON.stringify(fresh)) throw new Error('READBACK_MISMATCH')
      await finishCreationAttempt(check, attempt)
      ledger.clear(check.identity, kind, target)
      return fresh
    } catch (cause) {
      await finishRemovedCreation(cause, kind, target, attempt, id)
      await creationFailed(kind, target, attempt, id)
      if (id) throw Object.assign(new Error('READBACK_FAILED'), { readbackId: id })
      throw cause
    }
  }
  const recoverCreated = async <T extends { _id: string }>(
    kind: CreationKind,
    target: string,
    write: (attempt: CreationAttempt) => Promise<T>,
    read: (id: string) => Promise<T>
  ) => {
    const previous = ledger.get(check.identity, kind, target)
    if (previous?.inflight) throw new Error('CREATE_OUTCOME_PENDING')
    ledger.set(check.identity, kind, target, { ...previous, inflight: true, phase: 'unknown', owner })
    let attempt: CreationAttempt | null = null, id: string | undefined
    try {
      attempt = await readCreationAttempt(check, kind, target)
      if (attempt?.cancelRequested) throw new Error('CREATION_CANCELLATION_PENDING')
      id = attempt?.resultId || ledger.get(check.identity, kind, target)?.id
      if (!id) {
        if (!attempt) throw new Error('CREATE_OUTCOME_PENDING')
        const saved = await write(attempt)
        id = saved._id
        await recordCreatedId(storeOwner, attempt, id)
      }
      await check()
      ledger.set(check.identity, kind, target, { inflight: true, phase: 'known', id, recoverable: !!attempt, owner })
      const fresh = await read(id)
      await check()
      if (attempt) await finishCreationAttempt(check, attempt)
      ledger.clear(check.identity, kind, target)
      return fresh
    } catch (cause) {
      await finishRemovedCreation(cause, kind, target, attempt, id)
      await creationFailed(kind, target, attempt, id, previous)
      throw cause
    }
  }
  const cancelCreated = async <T extends { _id: string }>(kind: CreationKind, target: string, path: string, read: (id: string) => Promise<T>) => {
    const previous = ledger.get(check.identity, kind, target)
    if (previous?.inflight) throw new Error('CREATE_OUTCOME_PENDING')
    ledger.set(check.identity, kind, target, { ...previous, inflight: true, phase: previous?.phase || 'unknown', owner })
    let attempt: CreationAttempt | null = null, id: string | undefined
    try {
      attempt = await readCreationAttempt(check, kind, target)
      if (!attempt) throw new Error('CREATE_OUTCOME_PENDING')
      attempt = await requestCreationCancellation(check, attempt)
      id = attempt.resultId
      if (!id) {
        const result = data(z.discriminatedUnion('state', [
          z.object({ state: z.literal('cancelled') }),
          z.object({ state: z.literal('created'), id: z.string().min(1) }),
        ]), await request(path, { method: 'POST', body: { ...attempt.input, requestId: attempt.requestId } }))
        if (result.state === 'created') {
          id = result.id
          await recordCreatedId(storeOwner, attempt, id)
        }
      }
      await check()
      const fresh = id ? await read(id) : null
      await check()
      await finishCreationAttempt(check, attempt)
      ledger.clear(check.identity, kind, target)
      return fresh
    } catch (cause) {
      await finishRemovedCreation(cause, kind, target, attempt, id)
      await creationFailed(kind, target, attempt, id, previous)
      throw cause
    }
  }
  const deliveryPhase = (proposal: Proposal) => {
    const latest = new Map(
      proposal.delivery?.map((entry) => [
        entry.mediaId || entry.type,
        entry.status,
      ])
    )
    if ([...latest.values()].includes('failed')) return 'partial' as const
    if (latest.size && [...latest.values()].every((value) => value === 'sent'))
      return 'sent' as const
    return 'unknown' as const
  }
  const request = (
    path: string,
    options?: { method?: 'POST' | 'PATCH' | 'DELETE'; body?: unknown }
  ) => check.request<unknown>(path, options)
  const exact = <T extends { _id: string }>(item: T, id: string): T => {
    if (item._id !== id) throw new Error('READBACK_ID_MISMATCH')
    return item
  }
  const get = async (id: string) =>
    exact(data(proposalSchema, await request(`/proposals/${pathId(id)}`)), id)
  const template = async (id: string) =>
    exact(
      data(templateSchema, await request(`/proposal-templates/${pathId(id)}`)),
      id
    )
  const list = async (eventId: string) => {
    const items = data(
      z.array(proposalSchema),
      await request(`/events/${pathId(eventId)}/proposals`)
    )
    if (items.some((item) => item.eventId !== eventId))
      throw new Error('EVENT_MISMATCH')
    return items
  }
  const previewSchema = z
    .object({
      title: z.string(),
      blocks: z.array(blockSchema),
      packages: z.array(packageSchema),
      media: z.array(mediaSchema),
    })
    .passthrough()
  const defaultsSchema = templateSchema.omit({
    _id: true,
    name: true,
    status: true,
  })
  const validateMedia = (file: PickedMedia, logo = false, gallery = false) => {
    const image = [
      'image/jpeg',
      'image/png',
      'image/webp',
      ...(!logo && !gallery ? ['image/gif'] : []),
    ].includes(file.mimeType || '')
    const video =
      !logo && (gallery ? file.mimeType === 'video/mp4' : ['video/mp4', 'video/webm'].includes(file.mimeType || ''))
    const limit = (logo ? 5 : image ? 10 : gallery ? 50 : 40) * 1024 * 1024
    if (
      (!image && !video) ||
      !file.uri ||
      !file.name ||
      !file.size ||
      file.size > limit
    )
      throw new Error('INVALID_MEDIA_FILE')
  }
  const appendFile = (form: FormData, key: string, file: PickedMedia) => {
    if (file.file) form.append(key, file.file, file.name)
    else
      form.append(key, {
        uri: file.uri,
        name: file.name,
        type: file.mimeType,
      } as unknown as Blob)
  }
  const uploadMedia = async (
      kind: 'proposal' | 'template',
      id: string,
      file: PickedMedia,
      gallery = false
    ) => {
      validateMedia(file, false, gallery)
      const directory = `${kind === 'proposal' ? 'proposals' : 'proposal-templates'}/${pathId(id)}`
      const form = new FormData()
      form.append('directory', directory)
      appendFile(form, 'files', file)
      const response = z
        .object({ success: z.literal(true), data: z.unknown() })
        .parse(await check.upload<unknown>('/escalioncloud', form))
      const url = resolveUploadedFileUrl(response.data, { directory })
      if (!url) throw new Error('UPLOAD_URL_MISSING')
      return url as string
    }
  const templates = async () =>
    data(z.array(templateSchema), await request('/proposal-templates'))
  const event = async (eventId: string) =>
    exact(
      data(eventSchema, await request(`/mobile/v1/events/${pathId(eventId)}`)),
      eventId
    )
  const writeProposal = async (eventId: string, attempt: CreationAttempt) => {
    const item = data(proposalSchema, await request(`/mobile/v1/events/${pathId(eventId)}/proposals`, {
      method: 'POST', body: { ...attempt.input, requestId: attempt.requestId },
    }))
    if (item.eventId !== eventId) throw new Error('EVENT_MISMATCH')
    return item
  }
  const readCreatedProposal = async (eventId: string, id: string) => {
    const item = await get(id)
    if (item.eventId !== eventId) throw new Error('EVENT_MISMATCH')
    return item
  }
  const writeTemplate = async (attempt: CreationAttempt) => data(templateSchema, await request('/mobile/v1/proposal-templates', {
    method: 'POST', body: { ...attempt.input, requestId: attempt.requestId },
  }))
  return {
    get,
    readEvent: event,
    template,
    list,
    templates,
    statuses: async () => data(z.record(z.string(), statusSchema), await request('/proposals/statuses')),
    expired: async () => data(z.array(expiredSchema), await request('/proposals/expired')),
    renew: async (id: string, eventId: string, day: string) => {
      const requested = Date.parse(day)
      if (!parsePeriodDay(day) || !Number.isFinite(requested) || requested <= Date.now()) throw new Error('FUTURE_DATE_REQUIRED')
      const current = await get(id)
      if (current.eventId !== eventId) throw new Error('EVENT_MISMATCH')
      if (!['published', 'expired'].includes(current.status)) throw new Error('PROPOSAL_NOT_PUBLISHED')
      // A lost reply or an intervening PWA renewal must not shorten the deadline.
      if (current.status === 'published' && current.validUntil && Date.parse(current.validUntil) >= requested) return current
      if (current.validUntil && Date.parse(current.validUntil) > requested) throw new Error('NEWER_EXPIRY')
      const saved = exact(data(proposalSchema, await request(`/proposals/${pathId(id)}`, {
        method: 'PATCH', body: { validUntil: day, contentRevision: current.contentRevision ?? 0 },
      })), id)
      await check()
      const fresh = await get(id)
      await check()
      if (fresh.eventId !== eventId || fresh.status !== 'published' || !fresh.validUntil || Date.parse(fresh.validUntil) < requested || JSON.stringify(saved) !== JSON.stringify(fresh)) throw new Error('READBACK_MISMATCH')
      return fresh
    },
    services: async () =>
      data(
        z.array(
          z.object({
            _id: z.string(),
            title: z.string(),
            description: z.string().nullable().optional(),
            price: z.number().nullable().optional(),
          })
        ),
        await request('/services')
      ).map((item) => ({
        ...item,
        description: item.description || '',
        price: Math.max(0, item.price || 0),
      })),
    templateDefaults: async () =>
      data(defaultsSchema, await request('/proposal-templates/defaults')),
    templateFromProposal: async (id: string) =>
      data(templateSchema.omit({ _id: true }), await request(`/proposals/${pathId(id)}?view=template-draft`)),
    previewTemplate: async (id: string, body: Record<string, unknown>) =>
      data(
        previewSchema,
        await request(`/proposal-templates/${pathId(id)}/preview`, {
          method: 'POST',
          body,
        })
      ),
    previewProposal: async (id: string, body: Record<string, unknown>) =>
      data(
        previewSchema,
        await request(`/proposals/${pathId(id)}/preview`, {
          method: 'POST',
          body,
        })
      ),
    uploadMedia: (kind: 'proposal' | 'template', id: string, file: PickedMedia) => uploadMedia(kind, id, file),
    uploadGallery: (kind: 'proposal' | 'template', id: string, file: PickedMedia) => uploadMedia(kind, id, file, true),
    uploadLogo: async (id: string, file: PickedMedia) => {
      validateMedia(file, true)
      const form = new FormData()
      appendFile(form, 'file', file)
      const saved = data(
        z.object({ url: z.string().url() }),
        await check.upload<unknown>(`/proposals/${pathId(id)}/logo`, form)
      )
      await check()
      await get(id)
      await check()
      return saved.url
    },
    uploadTemplateLogo: async (id: string, file: PickedMedia) => {
      validateMedia(file, true)
      const form = new FormData()
      appendFile(form, 'file', file)
      const saved = data(
        z.object({ url: z.string().url() }),
        await check.upload<unknown>(`/proposal-templates/${pathId(id)}/logo`, form)
      )
      await check()
      if (id !== 'new') await template(id)
      await check()
      return saved.url
    },
    removeTemplate: async (id: string) => {
      const response = z
        .object({
          success: z.literal(true),
          archived: z.boolean().optional(),
          data: z.unknown(),
        })
        .parse(
          await request(`/proposal-templates/${pathId(id)}`, {
            method: 'DELETE',
          })
        )
      await check()
      if (response.archived) {
        const archived = exact(
          z
            .object({ _id: z.string(), status: z.literal('archived') })
            .parse(response.data),
          id
        )
        if (
          archived.status !== 'archived' ||
          (await template(id)).status !== 'archived'
        )
          throw Error('ARCHIVE_UNCONFIRMED')
      } else {
        if (z.object({ id: z.string() }).parse(response.data).id !== id)
          throw Error('DELETE_ID_MISMATCH')
      }
      await check()
      const items = await templates()
      await check()
      if (!response.archived && items.some((item) => item._id === id))
        throw Error('DELETE_UNCONFIRMED')
      return { archived: Boolean(response.archived), items }
    },
    restoreCreate: (eventId: string) => restoreCreation('create-proposal', eventId),
    restoreTemplate: async () => {
      const attempt = await restoreCreation('create-template', 'new')
      return attempt ? templateSchema.parse({ ...attempt.input, _id: 'new' }) : null
    },
    recoverCreate: (eventId: string) => recoverCreated('create-proposal', eventId,
      attempt => writeProposal(eventId, attempt), id => readCreatedProposal(eventId, id)),
    recoverTemplate: () => recoverCreated('create-template', 'new', writeTemplate, template),
    cancelCreate: (eventId: string) => cancelCreated('create-proposal', eventId,
      `/mobile/v1/events/${pathId(eventId)}/proposals/cancel`, id => readCreatedProposal(eventId, id)),
    cancelTemplate: () => cancelCreated('create-template', 'new', '/mobile/v1/proposal-templates/cancel', template),
    create: (eventId: string, body: { templateId?: string; sourceProposalId?: string }) =>
      created('create-proposal', eventId, body, attempt => writeProposal(eventId, attempt), id => readCreatedProposal(eventId, id)),
    save: async (id: string, body: Record<string, unknown>) => {
      const saved = exact(
        data(
          proposalSchema,
          await request(`/proposals/${pathId(id)}`, { method: 'PATCH', body })
        ),
        id
      )
      await check()
      const fresh = await get(id)
      await check()
      if (JSON.stringify(saved) !== JSON.stringify(fresh))
        throw Error('READBACK_MISMATCH')
      return fresh
    },
    action: async (
      proposal: Proposal,
      action: 'publish' | 'revoke' | 'apply'
    ) => {
      if (
        action === 'apply' &&
        ledger.get(check.identity, 'apply', proposal._id)
      )
        throw new Error('APPLY_READ_PENDING')
      if (action === 'revoke' && proposal.selectedPackageId)
        throw new Error('SELECTED_REVOKE_FORBIDDEN')
      const saved = exact(
        data(
          proposalSchema,
          await request(`/proposals/${pathId(proposal._id)}`, {
            method: 'PATCH',
            body: { action },
          })
        ),
        proposal._id
      )
      if (action === 'apply')
        ledger.set(check.identity, 'apply', proposal._id, {
          inflight: false,
          phase: 'applied',
          id: proposal._id,
          proposal: saved,
        })
      await check()
      const fresh = await get(proposal._id)
      await check()
      if (fresh.eventId !== proposal.eventId) throw new Error('EVENT_MISMATCH')
      if (JSON.stringify(saved) !== JSON.stringify(fresh))
        throw new Error('READBACK_MISMATCH')
      if (action !== 'apply') return { proposal: fresh }
      const freshEvent = await event(proposal.eventId)
      await check()
      ledger.set(check.identity, 'apply', proposal._id, {
        inflight: false,
        phase: 'applied',
        id: proposal._id,
        proposal: fresh,
        event: freshEvent,
      })
      return { proposal: fresh, event: freshEvent }
    },
    recoverApply: async (proposalId: string, eventId: string) => {
      const state = ledger.get(check.identity, 'apply', proposalId)
      if (!state || state.inflight) throw new Error('APPLY_READ_PENDING')
      const fresh = await get(proposalId)
      await check()
      if (fresh.eventId !== eventId || !fresh.appliedAt || fresh.applicationPending || (fresh.applyOperation && fresh.applyOperation.state !== 'confirmed'))
        throw new Error('APPLY_UNCONFIRMED')
      const freshEvent = await event(eventId)
      await check()
      ledger.set(check.identity, 'apply', proposalId, {
        ...state,
        proposal: fresh,
        event: freshEvent,
      })
      return { proposal: fresh, event: freshEvent }
    },
    remove: async (proposal: Proposal) => {
      const deleted = data(
        z.object({ id: z.string() }),
        await request(`/proposals/${pathId(proposal._id)}`, {
          method: 'DELETE',
        })
      )
      if (deleted.id !== proposal._id) throw new Error('DELETE_ID_MISMATCH')
      await check()
      const items = await list(proposal.eventId)
      await check()
      if (items.some((item) => item._id === proposal._id))
        throw new Error('DELETE_UNCONFIRMED')
      return { items, event: await event(proposal.eventId) }
    },
    saveTemplate: async (
      id: string | undefined,
      body: Record<string, unknown>
    ) => {
      if (!id) return created('create-template', 'new', body, writeTemplate, template)
      const saved = exact(
        data(
          templateSchema,
          await request(`/proposal-templates/${pathId(id)}`, {
            method: 'PATCH',
            body,
          })
        ),
        id
      )
      await check()
      const fresh = await template(id)
      await check()
      if (JSON.stringify(saved) !== JSON.stringify(fresh))
        throw new Error('READBACK_MISMATCH')
      return fresh
    },
    reconcileSend: async (id: string) => {
      const state = ledger.get(check.identity, 'send', id)
      if (!state || state.inflight) throw new Error('SEND_OUTCOME_PENDING')
      ledger.set(check.identity, 'send', id, { ...state, inflight: true })
      try {
        const proposal = await get(id)
        await check()
        ledger.set(check.identity, 'send', id, {
          inflight: false,
          phase: deliveryPhase(proposal),
          proposal,
        })
        return proposal
      } catch (cause) {
        ledger.set(check.identity, 'send', id, { ...state, inflight: false })
        throw cause
      }
    },
    sendTelegram: async (id: string, retryFailedOnly = false) => {
      const previous = ledger.get(check.identity, 'send', id)
      if (
        previous &&
        (previous.inflight || previous.phase !== 'partial' || !retryFailedOnly)
      )
        throw new Error('SEND_OUTCOME_PENDING')
      ledger.set(check.identity, 'send', id, {
        inflight: true,
        phase: 'unknown',
      })
      const before = check.dispatched
      try {
        const response = z
          .object({
            success: z.boolean(),
            error: z.object({ code: z.string() }).optional(),
          })
          .passthrough()
          .parse(
            await request(`/proposals/${pathId(id)}/send-telegram`, {
              method: 'POST',
              body: { retryFailedOnly },
            })
          )
        const partial =
          response.success === false &&
          response.error?.code === 'partial_delivery'
        if (!response.success && !partial) throw new Error('SEND_UNCONFIRMED')
        await check()
        const proposal = await get(id)
        await check()
        ledger.set(check.identity, 'send', id, {
          inflight: false,
          phase: partial ? 'partial' : 'sent',
          proposal,
        })
        return { partial, proposal }
      } catch (cause) {
        if (check.dispatched === before) {
          if (previous) ledger.set(check.identity, 'send', id, previous)
          else ledger.clear(check.identity, 'send', id)
        } else
          ledger.set(check.identity, 'send', id, {
            inflight: false,
            phase: 'unknown',
          })
        throw cause
      }
    },
  }
}

type BoundApi = ReturnType<typeof createBoundApi>
type WithOperation<F> = F extends (...args: infer A) => infer R
  ? (...args: [...A, operation?: ProposalOperation]) => R
  : never
const arities: Record<keyof BoundApi, number> = {
  statuses: 0,
  expired: 0,
  renew: 3,
  restoreCreate: 1,
  restoreTemplate: 0,
  recoverCreate: 1,
  recoverTemplate: 0,
  cancelCreate: 1,
  cancelTemplate: 0,
  reconcileSend: 1,
  recoverApply: 2,
  get: 1,
  readEvent: 1,
  template: 1,
  list: 1,
  templates: 0,
  services: 0,
  templateDefaults: 0,
  templateFromProposal: 1,
  previewTemplate: 2,
  previewProposal: 2,
  uploadMedia: 3,
  uploadGallery: 3,
  uploadLogo: 2,
  uploadTemplateLogo: 2,
  removeTemplate: 1,
  create: 2,
  save: 2,
  action: 2,
  remove: 1,
  saveTemplate: 2,
  sendTelegram: 2,
}
export const proposalsApi = Object.fromEntries(
  Object.entries(arities).map(([name, arity]) => [
    name,
    async (...args: unknown[]) => {
      const check = await captureProposalIdentity(
        args[arity] as ProposalOperation | undefined
      )
      try {
        const bound = createBoundApi(check)
        const call = bound[name as keyof BoundApi] as (
          ...values: unknown[]
        ) => Promise<unknown>
        const result = await call(...args.slice(0, arity))
        await check()
        return result
      } finally {
        check.close()
        if (['renew', 'save', 'create', 'action', 'remove', 'recoverApply', 'recoverCreate', 'cancelCreate', 'sendTelegram'].includes(name)) notifyProposalChanges()
      }
    },
  ])
) as { [K in keyof BoundApi]: WithOperation<BoundApi[K]> }
