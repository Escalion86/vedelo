import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import {
  replacePartiesTablesInXml,
  toDocxtemplaterData,
  toDocxTemplateKey,
} from '../helpers/exportDocxFromTemplate.js'

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const formatDocumentDate = (value) => {
  if (
    value &&
    (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
  )
    return null
  const date = value ? new Date(`${value}T12:00:00`) : new Date()
  if (Number.isNaN(date.getTime())) return null
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  // Date переносит, например, 31 февраля в март. Для документа это ошибка.
  if (value && iso !== value) return null
  return {
    iso,
    label: `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`,
  }
}

const renderDocxTemplate = ({ templateBase64, variables = {}, inspection = null }) => {
  const bytes = Buffer.from(String(templateBase64 || '').trim(), 'base64')
  if (!bytes.length) throw new Error('DOCX_TEMPLATE_EMPTY')

  const zip = new PizZip(bytes)
  const normalizedData = toDocxtemplaterData(variables)
  const document = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    parser: (rawTag) => {
      const key = toDocxTemplateKey(rawTag)
      return { get: () => {
        const value = normalizedData[key]
        if (inspection) {
          inspection.fields[key] = value ?? ''
          if (value === undefined) inspection.unknown.add(key)
          else if (value === '' || value === null || /^_+$/.test(String(value))) inspection.missing.add(key)
        }
        return value ?? ''
      } }
    },
  })
  document.render(normalizedData)

  const resultZip = document.getZip()
  const documentXml = resultZip.file('word/document.xml')
  if (documentXml) {
    const source = documentXml.asText()
    const result = replacePartiesTablesInXml(source, {
      DOMParserImpl: DOMParser,
      XMLSerializerImpl: XMLSerializer,
    })
    if (result !== source) resultZip.file('word/document.xml', result)
  }

  return resultZip.generate({ type: 'nodebuffer', mimeType: DOCX_MIME })
}

export { DOCX_MIME, formatDocumentDate, renderDocxTemplate }
