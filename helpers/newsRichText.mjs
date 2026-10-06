import DOMPurify from 'isomorphic-dompurify'
import { resolveUploadedFileUrl } from './escalionCloudUpload.mjs'

export const NEWS_CONTENT_MAX = 100000

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
  'img',
]

const ALLOWED_ATTR = [
  'href',
  'target',
  'rel',
  'src',
  'alt',
  'title',
  'loading',
]

export const escapeNewsHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

export const newsItemsToHtml = (items) => {
  const normalized = Array.isArray(items)
    ? items.map((item) => String(item ?? '').trim()).filter(Boolean)
    : []
  if (normalized.length === 0) return ''
  return `<ul>${normalized
    .map((item) => `<li>${escapeNewsHtml(item)}</li>`)
    .join('')}</ul>`
}

export const sanitizeNewsRichText = (value) =>
  DOMPurify.sanitize(String(value ?? '').slice(0, NEWS_CONTENT_MAX), {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:(?:https?):|\/uploads\/)/i,
  })
    .replace(/\s+src=(["'])(?:data|blob):[\s\S]*?\1/gi, '')
    .trim()

export const hasMeaningfulNewsContent = (value) => {
  const content = sanitizeNewsRichText(value)
  if (/<img\b[^>]*\bsrc=/i.test(content)) return true
  return content
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim().length > 0
}

export const getNewsContentHtml = (newsItem) => {
  const richText = sanitizeNewsRichText(newsItem?.contentHtml)
  return richText || newsItemsToHtml(newsItem?.items)
}

export const resolveNewsUploadUrl = (
  uploadResult,
  { directory = 'news/draft', project = 'artistcrm' } = {}
) =>
  resolveUploadedFileUrl(uploadResult, {
    directory: directory || 'news/draft',
    project,
  })
