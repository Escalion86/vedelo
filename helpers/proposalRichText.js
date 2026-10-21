import { proposalPhoneNumber } from './proposalArtistContacts.mjs'
import DOMPurify from 'isomorphic-dompurify'
import { sanitizeProposalTextStyle } from './proposalTextStyles.js'

export const PROPOSAL_RICH_TEXT_BLOCK_TYPES = Object.freeze([
  'intro',
  'benefits',
  'terms',
  'cta',
  'header',
  'packagesIntro',
  'packagesOutro',
  'closing',
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

// Объединённый раздел может содержать несколько прежних блоков по 30 000.
const MAX_RICH_TEXT_LENGTH = 160000
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
  'style',
]
const hasRemoteMediaSource = (value) =>
  /^(?:https?:\/\/|\/uploads\/)/i.test(value || '')

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

export const sanitizeProposalRichText = (value, { phone } = {}) => {
  const fragment = DOMPurify.sanitize(
    String(value ?? '').slice(0, MAX_RICH_TEXT_LENGTH),
    {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
      RETURN_DOM_FRAGMENT: true,
    }
  )
  fragment.querySelectorAll('[style]').forEach((element) => {
    const style = sanitizeProposalTextStyle(element.getAttribute('style'))
    if (style) element.setAttribute('style', style)
    else element.removeAttribute('style')
  })
  // Проверяем настоящий src узла: текст alt/title не должен обходить фильтр.
  fragment.querySelectorAll('img,video').forEach((element) => {
    if (!hasRemoteMediaSource(element.getAttribute('src'))) element.remove()
    if (
      element.hasAttribute('poster') &&
      !hasRemoteMediaSource(element.getAttribute('poster'))
    )
      element.removeAttribute('poster')
  })
  const number = proposalPhoneNumber(phone)
  if (number) {
    const doc = fragment.ownerDocument
    const walker = doc.createTreeWalker(fragment, 4)
    const nodes = []
    while (walker.nextNode()) nodes.push(walker.currentNode)
    for (const node of nodes) {
      if (node.parentElement?.closest('a')) continue
      const pattern = /\+?\d[\d\s()–-]{5,}\d/g
      const matches = [...node.textContent.matchAll(pattern)].filter(
        (match) => proposalPhoneNumber(match[0]) === number
      )
      if (!matches.length) continue
      const replacement = doc.createDocumentFragment()
      let offset = 0
      for (const match of matches) {
        replacement.append(
          doc.createTextNode(node.textContent.slice(offset, match.index))
        )
        const link = doc.createElement('a')
        link.setAttribute('href', `tel:+${number}`)
        link.textContent = match[0]
        replacement.append(link)
        offset = match.index + match[0].length
      }
      replacement.append(doc.createTextNode(node.textContent.slice(offset)))
      node.replaceWith(replacement)
    }
  }
  const container = fragment.ownerDocument.createElement('div')
  container.append(fragment)
  return container.innerHTML.trim()
}

export const getProposalBlockContentHtml = (block) => {
  if (!block || !PROPOSAL_RICH_TEXT_BLOCK_TYPES.includes(block.type)) return ''
  if (
    ['header', 'packagesIntro', 'packagesOutro', 'closing'].includes(block.type)
  )
    return sanitizeProposalRichText(block.contentHtml)
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
