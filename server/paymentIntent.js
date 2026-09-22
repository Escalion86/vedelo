import crypto from 'crypto'

const IDEMPOTENCE_KEY_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const resolvePaymentIdempotenceKey = (value) => {
  if (value === undefined || value === null || value === '') {
    return { key: crypto.randomUUID(), supplied: false }
  }

  const key = String(value).trim()
  return IDEMPOTENCE_KEY_RE.test(key)
    ? { key, supplied: true }
    : { key: '', supplied: true }
}

export const claimPaymentIntent = async ({
  PaymentsModel,
  tenantId,
  userId,
  idempotenceKey,
  values,
}) => {
  const creationToken = `creating:${crypto.randomUUID()}`
  const filter = { tenantId, userId, idempotenceKey }
  let payment
  const withConfirmationUrl = async (query) =>
    query && typeof query.select === 'function'
      ? query.select('+confirmationUrl')
      : query

  try {
    payment = await withConfirmationUrl(
      PaymentsModel.findOneAndUpdate(
        filter,
        {
          $setOnInsert: {
            ...values,
            tenantId,
            userId,
            idempotenceKey,
            rawProviderStatus: creationToken,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    )
  } catch (error) {
    if (error?.code !== 11000) throw error
    payment = await withConfirmationUrl(PaymentsModel.findOne(filter))
  }

  if (!payment) throw new Error('Не удалось создать платёжное намерение')
  return {
    payment,
    claimed: payment.rawProviderStatus === creationToken,
  }
}

export const getReusablePaymentIntentData = (payment, expected = {}) => {
  if (payment?.status !== 'pending' || !payment?.confirmationUrl) return null
  if (
    (expected.provider && payment.provider !== expected.provider) ||
    (expected.purpose && payment.purpose !== expected.purpose) ||
    (expected.tariffId !== undefined &&
      String(payment.tariffId || '') !== String(expected.tariffId || '')) ||
    (expected.amount !== undefined &&
      Number(payment.amount) !== Number(expected.amount))
  ) {
    return null
  }
  return {
    paymentId: String(payment._id),
    providerPaymentId: payment.providerPaymentId || '',
    status: payment.rawProviderStatus || 'CREATED',
    amount: Number(payment.amount || 0).toFixed(2),
    confirmationUrl: payment.confirmationUrl,
  }
}
