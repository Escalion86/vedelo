export const isReceiptPayment = (item) =>
  item?.type === 'income' &&
  Number(item.amount) > 0 &&
  !['barter', 'obligation'].includes(item.paymentMethod)

export const getPaymentsWithoutReceipts = (payments, documents) => {
  const linked = new Set(
    (documents || [])
      .filter((item) => item.type === 'receipt')
      .map((item) => item.transactionId)
  )
  return (payments || []).filter(
    (item) => isReceiptPayment(item) && !linked.has(String(item._id))
  )
}

export const normalizeDocumentMetadata = (document) => ({
  transactionId:
    /^[a-f\d]{24}$/i.test(String(document.transactionId || '')) &&
    document.type === 'receipt'
      ? String(document.transactionId)
      : '',
  number: String(document.number || '')
    .trim()
    .slice(0, 80),
  documentDate: /^\d{4}-\d{2}-\d{2}$/.test(String(document.documentDate || ''))
    ? document.documentDate
    : '',
  templateId: String(document.templateId || '').slice(0, 100),
})
