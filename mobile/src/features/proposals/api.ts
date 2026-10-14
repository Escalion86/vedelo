import { z } from 'zod'
import {
  captureProposalIdentity,
  type ProposalOperation,
  type BoundProposalOperation,
} from './identity'
import { proposalOperations } from './operations'
import { resolveUploadedFileUrl } from './uploadUrl.generated'
import { PROPOSAL_LINES_LIMIT, PROPOSAL_PACKAGES_LIMIT } from './limits'

const lineSchema = z.object({
  serviceId: z.string().default(''),
  title: z.string(),
  description: z.string().default(''),
  price: z.number().nonnegative(),
})
const packageSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().default(''),
  lines: z.array(lineSchema).max(PROPOSAL_LINES_LIMIT),
  total: z.number().nonnegative(),
  manualTotal: z.boolean().default(true),
  recommended: z.boolean().default(false),
})
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
})
const appearanceSchema = z.object({
  theme: z.enum(['classic', 'light', 'blue', 'dark']).default('classic'),
  logoUrl: z.string().default(''),
})
const proposalSchema = z.object({
  _id: z.string().min(1),
  eventId: z.string().min(1),
  title: z.string(),
  version: z.number().int().positive(),
  status: z.enum(['draft', 'published', 'expired', 'revoked']),
  packages: z.array(packageSchema).max(PROPOSAL_PACKAGES_LIMIT),
  blocksSnapshot: z.array(blockSchema),
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
  media: z.array(mediaSchema),
  messageTemplate: z.string(),
  defaults: z.object({
    packages: z.array(packageSchema).max(PROPOSAL_PACKAGES_LIMIT),
    servicesIds: z.array(z.string()).default([]),
  }),
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
  const created = async <T extends { _id: string }>(
    kind: string,
    target: string,
    write: () => Promise<T>,
    read: (id: string) => Promise<T>
  ) => {
    if (ledger.get(check.identity, kind, target))
      throw new Error('CREATE_OUTCOME_PENDING')
    ledger.set(check.identity, kind, target, {
      inflight: true,
      phase: 'unknown',
    })
    const before = check.dispatched
    let id: string | undefined
    try {
      const saved = await write()
      id = saved._id
      ledger.set(check.identity, kind, target, {
        inflight: true,
        phase: 'known',
        id,
      })
      await check()
      const fresh = await read(id)
      await check()
      if (
        kind === 'create-template' &&
        JSON.stringify(saved) !== JSON.stringify(fresh)
      )
        throw new Error('READBACK_MISMATCH')
      ledger.clear(check.identity, kind, target)
      return fresh
    } catch (cause) {
      if (check.dispatched === before)
        ledger.clear(check.identity, kind, target)
      else
        ledger.set(check.identity, kind, target, {
          inflight: false,
          phase: id ? 'known' : 'unknown',
          id,
        })
      if (id)
        throw Object.assign(new Error('READBACK_FAILED'), { readbackId: id })
      throw cause
    }
  }
  const recoverCreated = async <T extends { _id: string }>(
    kind: string,
    target: string,
    read: (id: string) => Promise<T>
  ) => {
    const state = ledger.get(check.identity, kind, target)
    if (!state?.id || state.inflight) throw new Error('CREATE_OUTCOME_PENDING')
    ledger.set(check.identity, kind, target, { ...state, inflight: true })
    try {
      const fresh = await read(state.id)
      await check()
      ledger.clear(check.identity, kind, target)
      return fresh
    } catch (cause) {
      ledger.set(check.identity, kind, target, { ...state, inflight: false })
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
  const validateMedia = (file: PickedMedia, logo = false) => {
    const image = [
      'image/jpeg',
      'image/png',
      'image/webp',
      ...(!logo ? ['image/gif'] : []),
    ].includes(file.mimeType || '')
    const video =
      !logo && ['video/mp4', 'video/webm'].includes(file.mimeType || '')
    const limit = (logo ? 5 : image ? 10 : 40) * 1024 * 1024
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
  const templates = async () =>
    data(z.array(templateSchema), await request('/proposal-templates'))
  const event = async (eventId: string) =>
    exact(
      data(eventSchema, await request(`/mobile/v1/events/${pathId(eventId)}`)),
      eventId
    )
  return {
    get,
    readEvent: event,
    template,
    list,
    templates,
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
    uploadMedia: async (
      kind: 'proposal' | 'template',
      id: string,
      file: PickedMedia
    ) => {
      validateMedia(file)
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
    },
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
    recoverCreate: (eventId: string) =>
      recoverCreated('create-proposal', eventId, async (id) => {
        const fresh = await get(id)
        if (fresh.eventId !== eventId) throw new Error('EVENT_MISMATCH')
        return fresh
      }),
    recoverTemplate: () => recoverCreated('create-template', 'new', template),
    create: (
      eventId: string,
      body: { templateId?: string; sourceProposalId?: string }
    ) =>
      created(
        'create-proposal',
        eventId,
        async () => {
          const item = data(
            proposalSchema,
            await request(`/events/${pathId(eventId)}/proposals`, {
              method: 'POST',
              body,
            })
          )
          if (item.eventId !== eventId) throw new Error('EVENT_MISMATCH')
          return item
        },
        async (id) => {
          const fresh = await get(id)
          if (fresh.eventId !== eventId) throw new Error('EVENT_MISMATCH')
          return fresh
        }
      ),
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
      if (fresh.eventId !== eventId || !fresh.appliedAt)
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
      if (!id)
        return created(
          'create-template',
          'new',
          () =>
            Promise.resolve(
              request('/proposal-templates', { method: 'POST', body })
            ).then((response) => data(templateSchema, response)),
          template
        )
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
  recoverCreate: 1,
  recoverTemplate: 0,
  reconcileSend: 1,
  recoverApply: 2,
  get: 1,
  readEvent: 1,
  template: 1,
  list: 1,
  templates: 0,
  services: 0,
  templateDefaults: 0,
  previewTemplate: 2,
  previewProposal: 2,
  uploadMedia: 3,
  uploadLogo: 2,
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
      }
    },
  ])
) as { [K in keyof BoundApi]: WithOperation<BoundApi[K]> }
