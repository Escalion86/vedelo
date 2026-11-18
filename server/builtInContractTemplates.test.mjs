import assert from 'node:assert/strict'
import test from 'node:test'
import PizZip from 'pizzip'
import {
  BUILT_IN_CONTRACT_TEMPLATES,
  getRecommendedBuiltInContractTemplates,
} from '../helpers/builtInContractTemplates.mjs'
import { getBuiltInContractTemplate } from './builtInContractTemplates.js'
import { renderDocxTemplate } from './documentGeneration.js'

const standardVariables = {
  НОМЕР_ДОКУМЕНТА: '61',
  ОСНОВНОЙ_ГОРОД: 'Красноярск',
  ДАТА_ДОГОВОРА: '19.11.2026',
  НАИМЕНОВАНИЕ_КЛИЕНТА: 'ООО Проверка',
  ИСПОЛНИТЕЛЬ_ПОДПИСАНТ: 'ИП Иванов Иван Иванович',
  ДАТА_СОБЫТИЯ: '28.11.2026 18:00',
  АДРЕС_СОБЫТИЯ: 'ул. Центральная, 10',
  СПИСОК_УСЛУГ: 'Работы по заказу',
  ДОГОВОРНАЯ_СУММА: '20 000 (двадцать тысяч рублей)',
  РЕКВИЗИТЫ_СТОРОН: `[[PARTIES_TABLES:${encodeURIComponent(JSON.stringify({
    performer: { title: 'Исполнитель', rows: [{ key: 'ИНН', value: '123' }] },
    customer: { title: 'Заказчик', rows: [{ key: 'ИНН', value: '456' }] },
  }))}]]`,
  ПОДПИСИ_СТОРОН: 'Места для подписей',
}

const getDocumentXml = (bytes) => new PizZip(bytes).file('word/document.xml').asText()

test('каталог рекомендует шаблоны по специализации и поддерживает общий вариант', () => {
  const ids = new Set(BUILT_IN_CONTRACT_TEMPLATES.map(({ id }) => id))
  assert.equal(ids.size, BUILT_IN_CONTRACT_TEMPLATES.length)
  assert.equal(getRecommendedBuiltInContractTemplates('events').length, 2)
  assert.equal(getRecommendedBuiltInContractTemplates('photo_video').length, 2)
  assert.equal(getRecommendedBuiltInContractTemplates('repair_home').length, 1)
  assert.equal(getRecommendedBuiltInContractTemplates('digital_services').length, 1)
  assert.deepEqual(getRecommendedBuiltInContractTemplates('consulting'), getRecommendedBuiltInContractTemplates('other'))
  assert.deepEqual(getRecommendedBuiltInContractTemplates(''), [])
})

test('подставляет штатные и специальные поля всех договоров в редактируемый DOCX', async () => {
  const contents = new Set()
  for (const metadata of BUILT_IN_CONTRACT_TEMPLATES) {
    const template = await getBuiltInContractTemplate(metadata.id)
    assert.equal(template.documentType, 'contract')
    assert.match(template.id, /-v1$/)
    assert.equal(template.version, 1)

    const raw = getDocumentXml(Buffer.from(template.contentBase64, 'base64'))
    for (const { key } of metadata.fields) assert.ok(raw.includes(`{${key}}`), key)
    const values = Object.fromEntries(
      metadata.fields.map(({ key, multiline }, index) => [
        key,
        multiline ? `Условие ${index + 1}\nПроверка & <текст>` : `Условие ${index + 1}`,
      ])
    )
    const inspection = { fields: {}, unknown: new Set(), missing: new Set() }
    const output = renderDocxTemplate({
      templateBase64: template.contentBase64,
      variables: { ...standardVariables, ...values },
      inspection,
    })
    const xml = getDocumentXml(output)
    assert.deepEqual([...inspection.unknown], [], template.id)
    assert.deepEqual([...inspection.missing], [], template.id)
    assert.match(xml, /ООО Проверка/)
    assert.match(xml, /Проверка &amp; &lt;текст&gt;/)
    assert.match(xml, /<w:br\/?/)
    assert.match(xml, /<w:tbl/)
    assert.doesNotMatch(xml, /PARTIES_TABLES|\{[А-Я_]+\}/)
    contents.add(xml)
  }
  assert.equal(contents.size, BUILT_IN_CONTRACT_TEMPLATES.length)
  assert.equal(await getBuiltInContractTemplate('builtin-contract-artist-performance-v0'), null)
})
