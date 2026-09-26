const DOCUMENT_TYPES = {
  CONTRACT: 'contract',
  INVOICE: 'invoice',
  RECEIPT: 'receipt',
  ACT: 'act',
  OTHER: 'other',
}

const DOCUMENT_TYPE_OPTIONS = [
  { value: DOCUMENT_TYPES.CONTRACT, name: 'Договор' },
  { value: DOCUMENT_TYPES.INVOICE, name: 'Счет' },
  { value: DOCUMENT_TYPES.RECEIPT, name: 'Чек' },
  { value: DOCUMENT_TYPES.ACT, name: 'Акт' },
  { value: DOCUMENT_TYPES.OTHER, name: 'Другое' },
]

const DOCUMENT_TYPE_LABELS = DOCUMENT_TYPE_OPTIONS.reduce((acc, item) => {
  acc[item.value] = item.name
  return acc
}, {})

const DOCUMENT_TYPE_LAST_NUMBER_KEYS = {
  [DOCUMENT_TYPES.CONTRACT]: 'contractLastNumber',
  [DOCUMENT_TYPES.INVOICE]: 'invoiceLastNumber',
  [DOCUMENT_TYPES.RECEIPT]: 'receiptLastNumber',
  [DOCUMENT_TYPES.ACT]: 'actLastNumber',
  [DOCUMENT_TYPES.OTHER]: 'otherLastNumber',
}

const normalizeDocumentType = (value) => {
  const normalized = String(value ?? '').trim()
  return DOCUMENT_TYPE_LABELS[normalized] ? normalized : DOCUMENT_TYPES.OTHER
}

const getDocumentTypeLabel = (type, customTypeName = '') => {
  const normalizedType = normalizeDocumentType(type)
  if (normalizedType === DOCUMENT_TYPES.OTHER) {
    const custom = String(customTypeName ?? '').trim()
    return custom || DOCUMENT_TYPE_LABELS[DOCUMENT_TYPES.OTHER]
  }
  return DOCUMENT_TYPE_LABELS[normalizedType]
}

const getDocumentDefaultTitle = (type, customTypeName = '') =>
  getDocumentTypeLabel(type, customTypeName)

const getDocumentTitleAfterTypeChange = ({
  title,
  previousType,
  nextType,
  previousCustomTypeName = '',
  nextCustomTypeName = '',
}) => {
  const currentTitle = String(title ?? '')
  const previousDefaultTitle = getDocumentDefaultTitle(
    previousType,
    previousCustomTypeName
  )

  if (
    currentTitle.trim() &&
    currentTitle.trim() !== previousDefaultTitle
  )
    return currentTitle

  return getDocumentDefaultTitle(nextType, nextCustomTypeName)
}

const getDocumentLastNumberKey = (type) =>
  DOCUMENT_TYPE_LAST_NUMBER_KEYS[normalizeDocumentType(type)] ??
  DOCUMENT_TYPE_LAST_NUMBER_KEYS[DOCUMENT_TYPES.OTHER]

export {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPE_OPTIONS,
  DOCUMENT_TYPE_LAST_NUMBER_KEYS,
  getDocumentDefaultTitle,
  getDocumentTitleAfterTypeChange,
  getDocumentLastNumberKey,
  getDocumentTypeLabel,
  normalizeDocumentType,
}
