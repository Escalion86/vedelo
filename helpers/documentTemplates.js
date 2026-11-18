import { DOCUMENT_TYPES, normalizeDocumentType } from './documentTypes.js'
import { getBuiltInContractTemplateMetadata } from './builtInContractTemplates.mjs'

const DOCX_TEMPLATE_MAX_BYTES = 5 * 1024 * 1024
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const createDocumentTemplateId = () => {
  if (typeof crypto !== 'undefined' && crypto?.randomUUID) {
    return crypto.randomUUID()
  }
  return `template-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const cleanString = (value) => String(value ?? '').trim()

const normalizeIsoDate = (value, fallback) => {
  const raw = cleanString(value)
  if (!raw) return fallback
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

const getFallbackTemplateName = (type, customTypeName = '') => {
  if (type === DOCUMENT_TYPES.CONTRACT) return 'Договор'
  if (type === DOCUMENT_TYPES.ACT) return 'Акт'
  if (type === DOCUMENT_TYPES.INVOICE) return 'Счет'
  if (type === DOCUMENT_TYPES.RECEIPT) return 'Чек'
  return cleanString(customTypeName) || 'Документ'
}

const normalizeDocumentTemplate = (
  template,
  { now = new Date().toISOString() } = {}
) => {
  if (!template || typeof template !== 'object') return null
  const templateBase64 = cleanString(template.templateBase64)
  if (!templateBase64) return null

  const type = normalizeDocumentType(template.type)
  const baseTemplate =
    type === DOCUMENT_TYPES.CONTRACT &&
    getBuiltInContractTemplateMetadata(template.baseTemplateId)
  const customTypeName =
    type === DOCUMENT_TYPES.OTHER ? cleanString(template.customTypeName) : ''

  return {
    id: cleanString(template.id) || createDocumentTemplateId(),
    name: cleanString(template.name) || getFallbackTemplateName(type, customTypeName),
    type,
    customTypeName,
    fileName: cleanString(template.fileName) || 'template.docx',
    templateBase64,
    ...(baseTemplate ? { baseTemplateId: baseTemplate.id } : {}),
    createdAt: normalizeIsoDate(template.createdAt, now),
    updatedAt: normalizeIsoDate(template.updatedAt, now),
  }
}

const normalizeDocumentTemplates = (templates, options = {}) => {
  if (!Array.isArray(templates)) return []
  const seen = new Set()
  return templates
    .map((template) => normalizeDocumentTemplate(template, options))
    .filter(Boolean)
    .filter((template) => {
      if (seen.has(template.id)) return false
      seen.add(template.id)
      return true
    })
}

const buildLegacyTemplate = ({
  id,
  name,
  type,
  fileName,
  templateBase64,
  now,
}) => {
  if (!cleanString(templateBase64)) return null
  return normalizeDocumentTemplate(
    {
      id,
      name,
      type,
      fileName: cleanString(fileName) || `${id}.docx`,
      templateBase64,
      createdAt: now,
      updatedAt: now,
    },
    { now }
  )
}

const normalizeDocumentTemplatesFromSettings = (
  customSettings,
  { now = new Date().toISOString() } = {}
) => {
  const custom =
    customSettings && typeof customSettings === 'object' ? customSettings : {}
  const result = normalizeDocumentTemplates(custom.documentTemplates, { now })
  const existingTypes = new Set(result.map((template) => template.type))
  const legacyTemplates = [
    buildLegacyTemplate({
      id: 'legacy-contract-template',
      name: 'Договор',
      type: DOCUMENT_TYPES.CONTRACT,
      fileName: custom.contractDocxTemplateFileName,
      templateBase64: custom.contractDocxTemplateBase64,
      now,
    }),
    buildLegacyTemplate({
      id: 'legacy-act-template',
      name: 'Акт',
      type: DOCUMENT_TYPES.ACT,
      fileName: custom.actDocxTemplateFileName,
      templateBase64: custom.actDocxTemplateBase64,
      now,
    }),
  ].filter(Boolean)

  legacyTemplates.forEach((template) => {
    if (!existingTypes.has(template.type)) {
      result.push(template)
      existingTypes.add(template.type)
    }
  })

  return result
}

const validateDocxTemplateFileMeta = (file) => {
  if (!file) return { valid: false, error: 'Выберите DOCX-файл' }
  const name = cleanString(file.name).toLowerCase()
  const type = cleanString(file.type)
  if (!name.endsWith('.docx') && type !== DOCX_MIME) {
    return { valid: false, error: 'Загрузите файл в формате .docx' }
  }
  if (Number(file.size) > DOCX_TEMPLATE_MAX_BYTES) {
    return {
      valid: false,
      error: 'Размер DOCX-шаблона не должен превышать 5 МБ',
    }
  }
  return { valid: true, error: '' }
}

export {
  DOCX_TEMPLATE_MAX_BYTES,
  normalizeDocumentTemplate,
  normalizeDocumentTemplates,
  normalizeDocumentTemplatesFromSettings,
  validateDocxTemplateFileMeta,
}
