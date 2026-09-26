import Transactions from '@models/Transactions'
import { isReceiptPayment } from '@helpers/documentWorkflow'

export const validateDocumentPaymentLinks = async (
  documents,
  tenantId,
  eventId
) => {
  const ids = [
    ...new Set(
      (documents || []).map((item) => item.transactionId).filter(Boolean)
    ),
  ]
  if (!ids.length) return true
  if (!eventId) return false
  const payments = await Transactions.find({
    _id: { $in: ids },
    tenantId,
    eventId,
  }).lean()
  return ids.every((id) =>
    payments.some(
      (payment) => String(payment._id) === id && isReceiptPayment(payment)
    )
  )
}
