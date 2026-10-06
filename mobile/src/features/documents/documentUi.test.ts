import { documentRows, removeDocumentPatch, requireDocument, requireEntity, requireLocalFile, readEntityResponse, readTemplatesResponse, safeDocumentError, safeDocumentUrl, validDocumentDate, validatePickedFile, DOCX_MIME, phaseLabel } from './documentUi'

const entity = { _id: 'a', documents: [{ id: 'd', type: 'contract' as const, title: 'Договор', file: { url: 'https://example.invalid/a' } }, { id: 'other', type: 'other' as const, file: { storageKey: 'keep' } }], documentFiles: [{ mobileUploadId: 'd', url: 'https://example.invalid/a', name: 'Legacy дубликат' }, { url: 'https://example.invalid/b', name: 'Фото' }], eventType: 'Не терять', servicesIds: ['keep'] }
it('X: legacy и canonical без дублей; снятие связи не теряет соседние документы и поля', () => {
  const rows = documentRows(entity)
  expect(rows.map((item) => item.id)).toEqual(['d', 'other', 'legacy:https://example.invalid/b'])
  const patch = removeDocumentPatch(entity, rows[0])
  expect(patch.documents.map((item) => item.id)).toEqual(['other'])
  expect(patch.documentFiles).toEqual([entity.documentFiles[1]])
  expect({ ...entity, ...patch }).toMatchObject({ eventType: 'Не терять', servicesIds: ['keep'] })
  expect(removeDocumentPatch(entity, rows[2]).documents).toEqual(entity.documents)
})
it('X: только ID текущей сущности/документа/локального файла', () => {
  expect(() => requireEntity(entity, 'foreign')).toThrow()
  expect(() => requireEntity(null, 'a')).toThrow()
  expect(() => requireDocument(entity, { id: 'foreign', type: 'other' })).toThrow()
  const file = { id: 'f', localUri: 'encrypted', name: 'Файл', mimeType: 'text/plain', size: 1, status: 'pending', entityType: 'events', entityId: 'a' }
  expect(requireLocalFile([file], file, 'events', 'a')).toBe(file)
  expect(() => requireLocalFile([file], file, 'clients', 'a')).toThrow()
  expect(() => requireLocalFile([file], file, 'events', 'other')).toThrow()
  expect(() => requireLocalFile([], file)).toThrow()
  expect(() => requireLocalFile([{ ...file, localUri: 'foreign' }], file)).toThrow()
})
it('X: success и согласованный ID обязательны перед кэшем', () => {
  expect(() => readEntityResponse({ success: false, data: entity }, 'a')).toThrow()
  expect(() => readEntityResponse({ success: true, data: entity }, 'foreign')).toThrow()
  expect(() => readTemplatesResponse({ success: false, data: [] })).toThrow()
  expect(() => readTemplatesResponse({ success: true, data: [{ id: '', name: '', fileName: '', type: 'other' }] })).toThrow()
})
it.each(['2026-02-29', '2026-04-31', '2026-13-01', '2026-01-00', '01.10.2026', ''])('X: отклоняет некорректную дату %s', (value) => expect(validDocumentDate(value)).toBe(false))
it.each(['2024-02-29', '2026-10-03'])('X: принимает календарную дату %s', (value) => expect(validDocumentDate(value)).toBe(true))
it('X: DOCX и лимит совпадают с действующим API, customTypeName не обязателен', () => {
  const file = { uri: 'cache://a', name: 'шаблон.docx', size: 5 * 1024 * 1024 }
  expect(validatePickedFile(file, true)).toBe('')
  expect(validatePickedFile({ ...file, size: file.size + 1 }, true)).toContain('5 МБ')
  expect(validatePickedFile({ ...file, name: 'a.pdf' }, true)).toContain('DOCX')
  expect(validatePickedFile({ ...file, name: 'a.bin', mimeType: DOCX_MIME }, true)).toBe('')
  expect(validatePickedFile(undefined)).toBeTruthy()
})
it.each(['file:///etc/a', 'javascript:alert(1)', 'https://user:password@example.invalid/a', ''])('X: не открывает небезопасный URL %s', (url) => expect(() => safeDocumentUrl(url)).toThrow())
it('X: безопасные сообщения и реальные фазы без сырых ошибок', () => {
  const cause = Object.assign(new Error('secret https://signed.invalid/token'), { status: 403 })
  expect(safeDocumentError(cause, 'Ошибка')).not.toContain('secret')
  expect(safeDocumentError(new Error('raw'), 'Ошибка')).toBe('Ошибка')
  expect(['pending', 'uploading', 'failed', 'synced'].map(phaseLabel)).toEqual(['Ожидает отправки', 'Отправляется', 'Ошибка отправки', 'Синхронизирован'])
})
