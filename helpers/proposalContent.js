import {
  getProposalBlockContentHtml,
  renderProposalRichTextVariables,
} from './proposalRichText.js'
import { calculatePackageTotal } from './proposalWorkflow.js'

export const PROPOSAL_BLOCK_TYPES = Object.freeze([
  'cover',
  'intro',
  'packages',
  'media',
  'benefits',
  'terms',
  'contacts',
  'cta',
])

export const DEFAULT_PROPOSAL_BLOCKS = Object.freeze([
  {
    id: 'cover',
    type: 'cover',
    title: 'Персональное предложение',
    enabled: true,
  },
  {
    id: 'intro',
    type: 'intro',
    title: 'Здравствуйте, {{client.firstName}}!',
    text: 'Подготовили варианты для вашего мероприятия.',
    enabled: true,
  },
  {
    id: 'packages',
    type: 'packages',
    title: 'Варианты программы',
    enabled: true,
  },
  { id: 'media', type: 'media', title: 'Фото и видео', enabled: true },
  {
    id: 'benefits',
    type: 'benefits',
    title: 'Почему выбирают нас',
    items: [],
    enabled: true,
  },
  { id: 'terms', type: 'terms', title: 'Условия', text: '', enabled: true },
  { id: 'contacts', type: 'contacts', title: 'Контакты', enabled: true },
  {
    id: 'cta',
    type: 'cta',
    title: 'Выберите подходящий вариант',
    text: '',
    enabled: true,
  },
])

const clean = (value, limit = 4000) =>
  String(value ?? '')
    .trim()
    .slice(0, limit)
const makeId = (prefix = 'item') =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`

const safeHttpUrl = (value) => {
  const url = clean(value, 2000)
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol)
      ? parsed.toString()
      : ''
  } catch {
    return ''
  }
}

const isSupportedVideoLink = (value) => {
  try {
    const host = new URL(value).hostname.toLowerCase()
    return [
      'youtube.com',
      'youtu.be',
      'rutube.ru',
      'vk.com',
      'vkvideo.ru',
    ].some((domain) => host === domain || host.endsWith(`.${domain}`))
  } catch {
    return false
  }
}

export const normalizeProposalMedia = (items) => {
  if (!Array.isArray(items)) return []
  return items.slice(0, 10).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const kind = ['image', 'video', 'video_link'].includes(item.kind)
      ? item.kind
      : ''
    const url = safeHttpUrl(item.url)
    if (!kind || !url || (kind === 'video_link' && !isSupportedVideoLink(url)))
      return []
    return [
      {
        id: clean(item.id, 100) || makeId('media'),
        kind,
        url,
        title: clean(item.title, 200),
        fileName: clean(item.fileName, 300),
        contentType: clean(item.contentType, 100),
        size: Math.max(0, Number(item.size) || 0),
      },
    ]
  })
}

export const normalizeProposalBlocks = (blocks) => {
  const source =
    Array.isArray(blocks) && blocks.length ? blocks : DEFAULT_PROPOSAL_BLOCKS
  const seen = new Set()
  return source.flatMap((block) => {
    if (
      !block ||
      !PROPOSAL_BLOCK_TYPES.includes(block.type) ||
      seen.has(block.type)
    )
      return []
    seen.add(block.type)
    const normalizedBlock = {
      id: clean(block.id, 100) || block.type,
      type: block.type,
      title: clean(block.title, 300),
      text: clean(block.text, 8000),
      items: Array.isArray(block.items)
        ? block.items
            .slice(0, 20)
            .map((item) => clean(item, 500))
            .filter(Boolean)
        : [],
      enabled: block.enabled !== false,
    }
    return [
      {
        ...normalizedBlock,
        contentHtml: getProposalBlockContentHtml({
          ...block,
          text: normalizedBlock.text,
          items: normalizedBlock.items,
        }),
      },
    ]
  })
}

export const normalizeProposalPackages = (packages) => {
  if (!Array.isArray(packages)) return []
  return packages.slice(0, 6).flatMap((item, index) => {
    if (!item || typeof item !== 'object') return []
    const title = clean(item.title, 200)
    if (!title) return []
    const lines = Array.isArray(item.lines)
      ? item.lines.slice(0, 30).flatMap((line) => {
          if (!line || typeof line !== 'object') return []
          const lineTitle = clean(line.title, 300)
          if (!lineTitle) return []
          return [
            {
              serviceId: clean(line.serviceId, 100),
              title: lineTitle,
              description: clean(line.description, 1000),
              price: Math.max(0, Number(line.price) || 0),
            },
          ]
        })
      : []
    return [
      {
        id: clean(item.id, 100) || makeId(`package-${index + 1}`),
        title,
        description: clean(item.description, 2000),
        lines,
        total: Math.max(
          0,
          item.manualTotal === false ? calculatePackageTotal(lines) : (Number.isFinite(Number(item.total)) ? Number(item.total) : calculatePackageTotal(lines))
        ),
        manualTotal: item.manualTotal !== false,
        recommended: Boolean(item.recommended),
      },
    ]
  })
}

export const PROPOSAL_TEMPLATE_SERVICES_LIMIT = 30

const isProposalServiceId = (value) => /^[a-f\d]{24}$/i.test(String(value || ''))

// Шаблон хранит те же варианты, что и КП: позиции, описание, цену, отметку
// «Рекомендуем» и ручной итог. Поле servicesIds сохранено для совместимости
// со старым форматом (один список услуг) и выводится из вариантов.
export const normalizeProposalTemplateDefaults = (defaults) => {
  const source = defaults && typeof defaults === 'object' ? defaults : {}
  const packages = normalizeProposalPackages(source.packages)
  const raw = Array.isArray(source.servicesIds) ? source.servicesIds : []
  const servicesIds = [
    ...new Set(
      raw.map((id) => String(id || '').trim()).filter(isProposalServiceId)
    ),
  ].slice(0, PROPOSAL_TEMPLATE_SERVICES_LIMIT)
  if (packages.length) {
    const fromPackages = [
      ...new Set(
        packages
          .flatMap((item) =>
            item.lines.map((line) => String(line.serviceId || '').trim())
          )
          .filter(isProposalServiceId)
      ),
    ].slice(0, PROPOSAL_TEMPLATE_SERVICES_LIMIT)
    return {
      packages,
      servicesIds: fromPackages.length ? fromPackages : servicesIds,
    }
  }
  return { packages: [], servicesIds }
}

const proposalServiceLine = (service) => ({
  serviceId: String(service._id),
  title: clean(service.title, 300),
  description: clean(service.description, 1000),
  price: Math.max(0, Number(service.price) || 0),
})

// Варианты шаблона становятся вариантами нового КП. Шаблон старого формата
// (один список услуг) превращается в вариант «Основной вариант»; без услуг
// шаблона поведение прежнее — вариант собирается из услуг заявки.
export const buildProposalDefaultPackages = ({
  templateDefaults,
  templateServices = [],
  eventServices = [],
  eventTotal = 0,
}) => {
  const defaults = normalizeProposalTemplateDefaults(templateDefaults)
  if (defaults.packages.length) return defaults.packages
  const selected = defaults.servicesIds
    .map((serviceId) =>
      (templateServices || []).find(
        (service) => String(service._id) === serviceId
      )
    )
    .filter(Boolean)
  const lines = (selected.length ? selected : eventServices || []).map(
    proposalServiceLine
  )
  const linesTotal = lines.reduce((sum, line) => sum + (Number(line.price) || 0), 0)
  const contractTotal = Number(eventTotal)
  const hasContractTotal = Number.isFinite(contractTotal) && contractTotal > 0
  return [
    {
      id: 'main',
      title: 'Основной вариант',
      description: '',
      lines,
      total: hasContractTotal ? contractTotal : linesTotal,
      manualTotal: hasContractTotal,
      recommended: true,
    },
  ]
}

export const buildProposalDefaultLines = (input) =>
  buildProposalDefaultPackages(input)[0]?.lines || []

// Шаблон старого формата (один список услуг) отдаётся клиенту уже с вариантами:
// и редактор шаблона, и редактор КП работают с моделью вариантов.
export const materializeProposalTemplateDefaults = (defaults, services = []) => {
  const normalized = normalizeProposalTemplateDefaults(defaults)
  if (normalized.packages.length) return normalized
  return {
    ...normalized,
    packages: buildProposalDefaultPackages({
      templateDefaults: normalized,
      templateServices: services,
      eventServices: [],
    }),
  }
}

const getByPath = (source, path) =>
  path.split('.').reduce((value, key) => value?.[key], source)

export const renderProposalVariables = (text, variables) => {
  const unknown = new Set()
  const rendered = String(text ?? '').replace(
    /{{\s*([\w.]+)\s*}}/g,
    (_, key) => {
      const value = getByPath(variables, key)
      if (value === undefined || value === null || value === '') {
        unknown.add(key)
        return `{{${key}}}`
      }
      return String(value)
    }
  )
  return { text: rendered, unknown: [...unknown] }
}

export const getProposalUnknownVariables = ({
  blocks,
  messageText,
  variables,
}) => {
  const unknown = new Set(
    renderProposalVariables(messageText, variables).unknown
  )
  normalizeProposalBlocks(blocks).forEach((block) => {
    renderProposalVariables(
      `${block.title}\n${block.text}`,
      variables
    ).unknown.forEach((key) => unknown.add(key))
    renderProposalRichTextVariables(
      block.contentHtml,
      variables
    ).unknown.forEach((key) => unknown.add(key))
  })
  return [...unknown]
}

export const DEFAULT_PROPOSAL_MESSAGE = 'Здравствуйте, {{client.firstName}}! Предложение для вашего мероприятия можете посмотреть по ссылке: {{proposal.url}}'

// Upgrade only the exact previous default; preserve custom messages.
export const normalizeProposalMessage = (value) =>
  value === 'Здравствуйте, {{client.firstName}}! Подготовили предложение для вашего мероприятия: {{proposal.url}}'
    ? DEFAULT_PROPOSAL_MESSAGE
    : value
