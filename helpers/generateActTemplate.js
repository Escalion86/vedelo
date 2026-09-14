import formatAddress from '@helpers/formatAddress'
import formatDate from '@helpers/formatDate'
import formatDateTime from '@helpers/formatDateTime'
import getPersonFullName from '@helpers/getPersonFullName'
import {
  getWorkItemTemplateVariables,
  replaceWorkItemTerms,
} from '@helpers/workItemTerminology.mjs'

const EMPTY_VALUE = '____________'
const PARTIES_TABLES_MARKER_PREFIX = '[[PARTIES_TABLES:'
const PARTIES_TABLES_MARKER_SUFFIX = ']]'
const SIGNATURES_TABLE_MARKER_PREFIX = '[[SIGNATURES_TABLE:'
const SIGNATURES_TABLE_MARKER_SUFFIX = ']]'

const clean = (value, fallback = EMPTY_VALUE) => {
  if (value === null || value === undefined) return fallback
  const text = String(value).trim()
  return text || fallback
}

const formatMoneyNoCurrency = (value) => {
  const amount = Number(value) || 0
  return `${amount.toLocaleString('ru-RU')}`
}

const getClientName = (client) => {
  if (!client) return EMPTY_VALUE
  return clean(
    getPersonFullName(client, {
      fallback: '',
      order: ['second', 'first', 'third'],
    })
  )
}

const getClientLegalName = (client) => {
  if (!client) return EMPTY_VALUE
  return clean(client.legalName || getClientName(client))
}

const normalizeToken = (value) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')

const ACT_TEMPLATE_VARIABLES = [
  'workItemLabel',
  'workItemLabelGenitive',
  'workItemLabelPlural',
  'workItemLabelPluralGenitive',
  'НОМЕР ДОКУМЕНТА',
  'ДАТА АКТА',
  'ДАТА ДОГОВОРА',
  'ОСНОВНОЙ ГОРОД',
  'НАИМЕНОВАНИЕ КЛИЕНТА',
  'ФИО КЛИЕНТА',
  'ФИО АРТИСТА',
  'ИСПОЛНИТЕЛЬ ПОДПИСАНТ',
  'НАИМЕНОВАНИЕ АРТИСТА',
  'СПИСОК УСЛУГ',
  'ДОГОВОРНАЯ СУММА',
  'ДАТА СОБЫТИЯ',
  'ГОРОД СОБЫТИЯ',
  'АДРЕС СОБЫТИЯ',
  'РЕКВИЗИТЫ СТОРОН',
  'ПОДПИСИ СТОРОН',
]

const DEFAULT_ACT_TEMPLATE = `АКТ № {НОМЕР ДОКУМЕНТА}
к договору оказания услуг от {ДАТА ДОГОВОРА}

г. {ОСНОВНОЙ ГОРОД} {ДАТА АКТА}

{НАИМЕНОВАНИЕ КЛИЕНТА}, именуемое(-ый, -ая) в дальнейшем «Заказчик», и {ИСПОЛНИТЕЛЬ ПОДПИСАНТ}, именуемый в дальнейшем «Исполнитель», составили настоящий акт о нижеследующем:

1. Исполнителем оказаны услуги по организации выступления {НАИМЕНОВАНИЕ АРТИСТА} на мероприятии {ДАТА СОБЫТИЯ} по адресу: {АДРЕС СОБЫТИЯ}.
2. Перечень оказанных услуг: {СПИСОК УСЛУГ}.
3. Стоимость оказанных услуг составляет {ДОГОВОРНАЯ СУММА} рублей.
4. Стороны претензий по объему, качеству и срокам оказания услуг не имеют.

5. АДРЕСА И РЕКВИЗИТЫ СТОРОН
{РЕКВИЗИТЫ СТОРОН}`

const buildPartiesRequisitesText = ({
  performerSignatory,
  performerRows,
  clientLegalName,
  clientRows,
}) =>
  [
    `Исполнитель: ${performerSignatory}`,
    ...performerRows.map(({ key, value }) => `${key}: ${value}`),
    '',
    `Заказчик: ${clientLegalName}`,
    ...clientRows.map(({ key, value }) => `${key}: ${value}`),
  ].join('\n')

const encodePartiesTablesMarker = (value) => {
  try {
    const payload = encodeURIComponent(JSON.stringify(value))
    return `${PARTIES_TABLES_MARKER_PREFIX}${payload}${PARTIES_TABLES_MARKER_SUFFIX}`
  } catch (error) {
    return ''
  }
}

const encodeSignaturesTableMarker = (value) => {
  try {
    const payload = encodeURIComponent(JSON.stringify(value))
    return `${SIGNATURES_TABLE_MARKER_PREFIX}${payload}${SIGNATURES_TABLE_MARKER_SUFFIX}`
  } catch (error) {
    return ''
  }
}

const toSurnameWithInitials = (fullName) => {
  const value = String(fullName ?? '').trim()
  if (!value || value === EMPTY_VALUE) return EMPTY_VALUE
  const parts = value.split(/\s+/).filter(Boolean)
  if (parts.length < 2) return value
  const surname = parts[0]
  const firstInitial = parts[1]?.[0] ? `${parts[1][0]}.` : ''
  const secondInitial = parts[2]?.[0] ? `${parts[2][0]}.` : ''
  return `${surname} ${firstInitial}${secondInitial}`.trim()
}

const buildPartiesSignaturesText = ({
  performerFullName,
  clientFullName,
  mode = 'preview',
}) => {
  const performerSignature = `${toSurnameWithInitials(performerFullName)} _______________`
  const clientSignature = `${toSurnameWithInitials(clientFullName)} _______________`

  if (mode === 'docx') {
    return encodeSignaturesTableMarker({
      leftTitle: 'Исполнитель',
      rightTitle: 'Заказчик',
      leftValue: performerSignature,
      rightValue: clientSignature,
    })
  }

  return [
    `Исполнитель: ${performerSignature}`,
    `Заказчик: ${clientSignature}`,
  ].join('\n')
}

const buildAutoDocumentNumber = (event, actMeta) => {
  const manualNumber = clean(actMeta?.documentNumber, '')
  if (manualNumber) return manualNumber
  const nextNumber = Number(actMeta?.nextDocumentNumber)
  if (Number.isFinite(nextNumber) && nextNumber > 0) return String(nextNumber)
  if (event?._id) return String(event._id).slice(-6).toUpperCase()
  return EMPTY_VALUE
}

const buildActVariables = ({
  event,
  client,
  serviceTitles,
  performerName,
  actMeta = {},
  siteSettings = {},
}) => {
  const actDateRaw = actMeta?.actDate
  const actDate =
    typeof actDateRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(actDateRaw)
      ? (() => {
          const [year, month, day] = actDateRaw.split('-')
          return `${day}.${month}.${year}`
        })()
      : formatDate(new Date())

  const contractDateRaw = actMeta?.contractDate
  const contractDate =
    typeof contractDateRaw === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(contractDateRaw)
      ? (() => {
          const [year, month, day] = contractDateRaw.split('-')
          return `${day}.${month}.${year}`
        })()
      : formatDate(new Date())

  const eventDateDateTime = event?.eventDate
    ? formatDateTime(event.eventDate)
    : EMPTY_VALUE
  const eventAddress = formatAddress(event?.address, EMPTY_VALUE)
  const servicesText =
    Array.isArray(serviceTitles) && serviceTitles.length > 0
      ? serviceTitles.join(', ')
      : EMPTY_VALUE
  const contractSum = Number(event?.contractSum) || 0
  const documentNumber = buildAutoDocumentNumber(event, actMeta)
  const artistStatusRaw =
    actMeta?.artistStatus === 'self_employed'
      ? 'self_employed'
      : 'individual_entrepreneur'
  const performerFullName = clean(actMeta?.artistFullName || performerName)
  const performerDisplayName = clean(actMeta?.artistName || performerName)
  const performerOgrnip =
    artistStatusRaw === 'self_employed'
      ? 'не применяется'
      : clean(actMeta?.artistOgrnip)
  const performerInn = clean(actMeta?.artistInn)
  const performerBank = clean(actMeta?.artistBankName)
  const performerBik = clean(actMeta?.artistBik)
  const performerCheckingAccount = clean(actMeta?.artistCheckingAccount)
  const performerCorrespondentAccount = clean(
    actMeta?.artistCorrespondentAccount
  )
  const performerLegalAddress = clean(actMeta?.artistLegalAddress)
  const performerSignatory =
    artistStatusRaw === 'self_employed'
      ? performerFullName
      : `Индивидуальный предприниматель ${performerFullName}`
  const baseTown = clean(actMeta?.defaultTown || event?.address?.town, EMPTY_VALUE)
  const contractSumFormatted = formatMoneyNoCurrency(contractSum)

  const clientLegalName = getClientLegalName(client)
  const clientRows = [
    { key: 'ФИО', value: getClientName(client) },
    { key: 'ИНН', value: clean(client?.inn, EMPTY_VALUE) },
    { key: 'КПП', value: clean(client?.kpp, EMPTY_VALUE) },
    { key: 'ОГРН/ОГРНИП', value: clean(client?.ogrn, EMPTY_VALUE) },
    { key: 'Банк', value: clean(client?.bankName, EMPTY_VALUE) },
    { key: 'БИК', value: clean(client?.bik, EMPTY_VALUE) },
    { key: 'р/с', value: clean(client?.checkingAccount, EMPTY_VALUE) },
    { key: 'к/с', value: clean(client?.correspondentAccount, EMPTY_VALUE) },
    { key: 'Юр. адрес', value: clean(client?.legalAddress, EMPTY_VALUE) },
  ]
  const performerRows = [
    { key: 'ИНН', value: performerInn },
    ...(artistStatusRaw === 'individual_entrepreneur'
      ? [{ key: 'ОГРНИП', value: performerOgrnip }]
      : []),
    { key: 'Банк', value: performerBank },
    { key: 'БИК', value: performerBik },
    { key: 'р/с', value: performerCheckingAccount },
    { key: 'к/с', value: performerCorrespondentAccount },
    { key: 'Юр. адрес', value: performerLegalAddress },
  ]
  const requisitesSidesMode =
    actMeta?.requisitesSidesMode === 'docx' ? 'docx' : 'preview'
  const partiesTablesValue =
    requisitesSidesMode === 'docx'
      ? encodePartiesTablesMarker({
          performer: {
            title: `Исполнитель: ${performerSignatory}`,
            rows: performerRows,
          },
          customer: {
            title: `Заказчик: ${clientLegalName}`,
            rows: clientRows,
          },
        })
      : buildPartiesRequisitesText({
          performerSignatory,
          performerRows,
          clientLegalName,
          clientRows,
        })

  return {
    ...getWorkItemTemplateVariables(siteSettings),
    'НОМЕР ДОКУМЕНТА': documentNumber,
    'ДАТА АКТА': actDate,
    'ДАТА ДОГОВОРА': contractDate,
    'ОСНОВНОЙ ГОРОД': baseTown,
    'НАИМЕНОВАНИЕ КЛИЕНТА': clientLegalName,
    'ФИО КЛИЕНТА': getClientName(client),
    'ФИО АРТИСТА': performerFullName,
    'ИСПОЛНИТЕЛЬ ПОДПИСАНТ': performerSignatory,
    'НАИМЕНОВАНИЕ АРТИСТА': performerDisplayName,
    'СПИСОК УСЛУГ': servicesText,
    'ДОГОВОРНАЯ СУММА': contractSumFormatted,
    'ДАТА СОБЫТИЯ': eventDateDateTime,
    'ГОРОД СОБЫТИЯ': clean(event?.address?.town, EMPTY_VALUE),
    'АДРЕС СОБЫТИЯ': eventAddress,
    'РЕКВИЗИТЫ СТОРОН': partiesTablesValue,
    'ПОДПИСИ СТОРОН': buildPartiesSignaturesText({
      performerFullName,
      clientFullName: getClientName(client),
      mode: requisitesSidesMode,
    }),
  }
}

const replaceTemplateVariables = (template, values) => {
  const source =
    typeof template === 'string' && template.trim()
      ? template
      : DEFAULT_ACT_TEMPLATE

  const normalizedMap = Object.entries(values).reduce((acc, [key, value]) => {
    acc[normalizeToken(key)] = value
    return acc
  }, {})

  return source.replace(/\{([^{}]+)\}/g, (match, tokenRaw) => {
    const normalizedToken = normalizeToken(tokenRaw)
    return normalizedToken in normalizedMap
      ? normalizedMap[normalizedToken]
      : match
  })
}

const generateActTemplate = ({
  event,
  client,
  serviceTitles = [],
  performerName = '',
  template = '',
  actMeta = {},
  siteSettings = {},
}) => {
  const variables = buildActVariables({
    event,
    client,
    serviceTitles,
    performerName,
    actMeta,
    siteSettings,
  })
  return replaceTemplateVariables(replaceWorkItemTerms(template, siteSettings), variables)
}

const getActTemplateVariablesMap = ({
  event,
  client,
  serviceTitles = [],
  performerName = '',
  actMeta = {},
  siteSettings = {},
}) =>
  buildActVariables({
    event,
    client,
    serviceTitles,
    performerName,
    actMeta,
    siteSettings,
  })

export { DEFAULT_ACT_TEMPLATE, ACT_TEMPLATE_VARIABLES, getActTemplateVariablesMap }
export default generateActTemplate
