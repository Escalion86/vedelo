import DOMPurify from 'isomorphic-dompurify'

export const PROPOSAL_RICH_TEXT_BLOCK_TYPES = Object.freeze([
  'intro',
  'benefits',
  'terms',
  'cta',
])

export const PROPOSAL_VARIABLE_OPTIONS = Object.freeze([
  { key: 'client.firstName', label: 'Имя клиента' },
  { key: 'client.fullName', label: 'Клиент полностью' },
  { key: 'event.type', label: 'Тип мероприятия' },
  { key: 'event.date', label: 'Дата мероприятия' },
  { key: 'event.services', label: 'Услуги' },
  { key: 'event.sum', label: 'Сумма' },
  { key: 'artist.fullName', label: 'Имя артиста' },
  { key: 'artist.phone', label: 'Телефон артиста' },
  { key: 'artist.telegram', label: 'Telegram артиста' },
])

const MAX_RICH_TEXT_LENGTH = 30000
const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  's',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'blockquote',
  'a',
  'span',
  'img',
  'video',
]
const ALLOWED_ATTR = [
  'href',
  'target',
  'rel',
  'data-proposal-variable',
  'data-proposal-variable-label',
  'src',
  'alt',
  'title',
  'loading',
  'controls',
  'preload',
  'playsinline',
  'poster',
  'width',
  'height',
]
// Медиа в текстовых блоках хранится в cloud.escalion.ru. DOMPurify по умолчанию
// разрешает data:-источники для img/video, поэтому после очистки удаляем медиа
// без внешнего http(s)-источника целиком (data:, blob:, javascript:).
const hasRemoteMediaSource = (tag) =>
  /src\s*=\s*["']?(?:https?:|\/uploads\/)/i.test(tag)

const stripNonRemoteMedia = (html) =>
  String(html ?? '')
    .replace(/<video\b[^>]*>[\s\S]*?<\/video>/gi, (tag) =>
      hasRemoteMediaSource(tag) ? tag : ''
    )
    .replace(/<video\b[^>]*\/?>/gi, (tag) =>
      hasRemoteMediaSource(tag) ? tag : ''
    )
    .replace(/<img\b[^>]*>/gi, (tag) => (hasRemoteMediaSource(tag) ? tag : ''))

export const escapeProposalHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

export const proposalPlainTextToHtml = (value) => {
  const source = String(value ?? '')
  if (!source.trim()) return ''
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  return lines
    .map((line) =>
      line ? `<p>${escapeProposalHtml(line)}</p>` : '<p><br></p>'
    )
    .join('')
}

export const proposalItemsToHtml = (items) => {
  const normalized = Array.isArray(items)
    ? items.map((item) => String(item ?? '').trim()).filter(Boolean)
    : []
  if (!normalized.length) return ''
  return `<ul>${normalized.map((item) => `<li>${escapeProposalHtml(item)}</li>`).join('')}</ul>`
}

export const sanitizeProposalRichText = (value) =>
  stripNonRemoteMedia(
    DOMPurify.sanitize(String(value ?? '').slice(0, MAX_RICH_TEXT_LENGTH), {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: true,
    })
  ).trim()

export const getProposalBlockContentHtml = (block) => {
  if (!block || !PROPOSAL_RICH_TEXT_BLOCK_TYPES.includes(block.type)) return ''
  const richText = String(block.contentHtml ?? '').trim()
  if (richText) return sanitizeProposalRichText(richText)
  if (block.type === 'benefits') return proposalItemsToHtml(block.items)
  return proposalPlainTextToHtml(block.text)
}

const getByPath = (source, path) =>
  path.split('.').reduce((value, key) => value?.[key], source)

export const renderProposalRichTextVariables = (contentHtml, variables) => {
  const unknown = new Set()
  const rendered = String(contentHtml ?? '').replace(
    /{{\s*([\w.]+)\s*}}/g,
    (_, key) => {
      const value = getByPath(variables, key)
      if (value === undefined || value === null || value === '') {
        unknown.add(key)
        return `{{${key}}}`
      }
      return escapeProposalHtml(value)
    }
  )
  return {
    html: sanitizeProposalRichText(rendered),
    unknown: [...unknown],
  }
}
