import test from 'node:test'
import assert from 'node:assert/strict'
import PizZip from 'pizzip'
import { extractImportFile, parseCsv } from './fileImportParser.mjs'
import {
  normalizeFileAnalysis,
  getFileImportCharge,
  isEventImportChecked,
  validateImportFile,
} from '../helpers/fileImport.mjs'

test('PDF и изображения отклоняются до ИИ, включая переименованный PDF', () => {
  for (const name of ['a.pdf', 'a.png', 'a.xls', 'a.doc', 'a.xlsm'])
    assert.throws(() => validateImportFile(name, 10))
  assert.throws(() => extractImportFile('a.txt', Buffer.from('%PDF-1.7')))
  assert.throws(() => validateImportFile('a.xlsx', 6 * 1024 * 1024))
})

test('CSV сохраняет разделители, многострочный текст и экранированные кавычки', () => {
  assert.deepEqual(
    parseCsv('Дата;Комментарий\r\n03.09.2026;"Привет;\n""мир"""'),
    [
      ['Дата', 'Комментарий'],
      ['03.09.2026', 'Привет;\n"мир"'],
    ]
  )
  assert.throws(() => parseCsv('a;b\n1;"missing'))
  assert.deepEqual(parseCsv('Дата;Комментарий\n03.09;"a,b,c,d,e,f,g"'), [
    ['Дата', 'Комментарий'],
    ['03.09', 'a,b,c,d,e,f,g'],
  ])
})

test('TXT поддерживает UTF-8 BOM и Windows-1251, пустые файлы отклоняются', () => {
  assert.equal(
    extractImportFile('a.txt', Buffer.from('\ufeffПривет')).lines[0].text,
    'Привет'
  )
  assert.equal(
    extractImportFile(
      'a.txt',
      Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2])
    ).lines[0].text,
    'Привет'
  )
  assert.throws(() => extractImportFile('a.txt', Buffer.from(' \n ')))
})

test('DOCX читает текст и таблицу, пропускает изображение', () => {
  const zip = new PizZip()
  zip.file(
    'word/document.xml',
    '<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>Заказы 2026</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>03.09</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Анна</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'
  )
  zip.file('word/media/image.png', 'not decoded')
  const parsed = extractImportFile(
    'a.docx',
    zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
  )
  assert.deepEqual(
    parsed.lines.map((line) => line.text),
    ['Заказы 2026', '03.09 | Анна']
  )
  assert.match(parsed.warnings[0], /изображения пропущены/)
})

test('XLSX читает листы, shared strings и даты, формулы не выполняются', () => {
  const zip = new PizZip()
  zip.file(
    'xl/workbook.xml',
    '<workbook xmlns:r="urn:r"><sheets><sheet name="Заказы" r:id="r1"/></sheets></workbook>'
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>'
  )
  zip.file('xl/sharedStrings.xml', '<sst><si><t>Анна</t></si></sst>')
  zip.file(
    'xl/styles.xml',
    '<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>'
  )
  zip.file(
    'xl/worksheets/sheet1.xml',
    '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" s="1"><v>46268</v></c><c r="C1"><f>WEBSERVICE("https://invalid")</f></c></row></sheetData></worksheet>'
  )
  const parsed = extractImportFile(
    'a.xlsx',
    zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
  )
  assert.match(parsed.lines[0].text, /Анна/)
  assert.match(parsed.lines[0].text, /2026-09-03/)
  assert.match(parsed.warnings[0], /Формулы/)
})

test('защита XML и ограничение объёма текста', () => {
  const zip = new PizZip()
  zip.file(
    'word/document.xml',
    '<!DOCTYPE doc [<!ENTITY x SYSTEM "file:///secret">]><doc>&x;</doc>'
  )
  assert.throws(
    () => extractImportFile('a.docx', zip.generate({ type: 'nodebuffer' })),
    /XML/
  )
  assert.throws(
    () => extractImportFile('a.txt', Buffer.from('a'.repeat(80001))),
    /слишком много/
  )
})

test('анализ привязывается к реальным строкам и ограничивает вопросы', () => {
  const lines = [{ id: 'L1' }, { id: 'L2' }]
  const normalized = normalizeFileAnalysis(
    {
      records: [{ title: 'A', sourceIds: ['L1'] }],
      questions: Array.from({ length: 9 }, () => ({ question: 'Год?' })),
    },
    lines
  )
  assert.equal(normalized.questions.length, 3)
  assert.deepEqual(normalized.ignoredLines, ['L2'])
  assert.throws(() =>
    normalizeFileAnalysis({ records: [{ sourceIds: ['L8'] }] }, lines)
  )
  assert.throws(() =>
    normalizeFileAnalysis(
      { records: [{ sourceIds: ['L1'] }, { sourceIds: ['L1'] }] },
      lines
    )
  )
})

test('два мероприятия в одной строке допустимы только с непересекающимися точными цитатами', () => {
  const lines = [{ id: 'L1', text: 'Анна 03.09.2026; Борис 04.09.2026' }]
  const records = [
    { sourceIds: ['L1'], excerpt: 'Анна 03.09.2026' },
    { sourceIds: ['L1'], excerpt: 'Борис 04.09.2026' },
  ]
  assert.equal(normalizeFileAnalysis({ records }, lines).records.length, 2)
  assert.throws(() =>
    normalizeFileAnalysis({ records: [records[0], records[0]] }, lines)
  )
})

test('расход ограничен резервом, неизвестная стоимость не угадывается', () => {
  assert.deepEqual(
    getFileImportCharge(
      { amountKopecks: 100, spentKopecks: 0, markup: 1.5 },
      { cost_rub: 0.1 }
    ),
    { charged: 15, uncovered: 0, covered: 0, coveredProviderKopecks: 0 }
  )
  assert.deepEqual(
    getFileImportCharge(
      { amountKopecks: 100, spentKopecks: 80, markup: 1.5 },
      { cost_rub: 1 }
    ),
    { charged: 20, uncovered: 130, covered: 0, coveredProviderKopecks: 0 }
  )
  assert.throws(
    () =>
      getFileImportCharge(
        { amountKopecks: 100, spentKopecks: 0, markup: 1.5 },
        {}
      ),
    /не сообщил стоимость/
  )
})

test('включённая в тариф себестоимость платится платформой, а не балансом', () => {
  // Запрос 1 ₽ себестоимости при наценке 1.5 → 150 копеек; тариф берёт 0,4 ₽ себестоимости.
  assert.deepEqual(
    getFileImportCharge(
      {
        amountKopecks: 150,
        holdKopecks: 90,
        coveredProviderKopecks: 40,
        spentCoveredProviderKopecks: 0,
        spentKopecks: 0,
        markup: 1.5,
      },
      { cost_rub: 1 }
    ),
    { charged: 90, uncovered: 0, covered: 60, coveredProviderKopecks: 40 }
  )
  // Лимит тарифа исчерпан: списание целиком уходит на баланс пользователя.
  assert.deepEqual(
    getFileImportCharge(
      {
        amountKopecks: 150,
        holdKopecks: 90,
        coveredProviderKopecks: 40,
        spentCoveredProviderKopecks: 40,
        spentKopecks: 0,
        markup: 1.5,
      },
      { cost_rub: 1 }
    ),
    { charged: 90, uncovered: 60, covered: 0, coveredProviderKopecks: 0 }
  )
  // Тариф покрывает запрос полностью: баланс не резервируется и не списывается.
  assert.deepEqual(
    getFileImportCharge(
      {
        amountKopecks: 150,
        holdKopecks: 0,
        coveredProviderKopecks: 200,
        spentCoveredProviderKopecks: 0,
        spentKopecks: 0,
        markup: 1.5,
      },
      { cost_rub: 1 }
    ),
    { charged: 0, uncovered: 0, covered: 150, coveredProviderKopecks: 100 }
  )
})

test('проверка импорта файла независима от календарного флага', () => {
  assert.equal(
    isEventImportChecked({
      importedFromFile: true,
      fileImportChecked: false,
      calendarImportChecked: true,
    }),
    false
  )
  assert.equal(
    isEventImportChecked({
      importedFromFile: true,
      fileImportChecked: true,
      calendarImportChecked: false,
    }),
    true
  )
  assert.equal(isEventImportChecked({ calendarImportChecked: true }), true)
})
