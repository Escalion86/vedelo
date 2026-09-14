import crypto from 'crypto'

const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3'

const getYookassaConfig = () => {
  const shopId = String(process.env.YOOKASSA_SHOP_ID || '').trim()
  const secretKey = String(process.env.YOOKASSA_SECRET_KEY || '').trim()
  const returnUrl = String(
    process.env.YOOKASSA_RETURN_URL || `${process.env.DOMAIN || 'https://vedelo.ru'}/cabinet/tariff-select`
  ).trim()
  return { shopId, secretKey, returnUrl }
}

const isYookassaConfigured = () => {
  const { shopId, secretKey } = getYookassaConfig()
  return Boolean(shopId && secretKey)
}

const getAuthHeader = () => {
  const { shopId, secretKey } = getYookassaConfig()
  return `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`
}

const normalizeAmount = (amount) => {
  const value = Number(amount)
  if (!Number.isFinite(value) || value <= 0) return ''
  return value.toFixed(2)
}

const buildReceipt = ({ amount, description, user }) => {
  if (process.env.YOOKASSA_SEND_RECEIPT !== 'true') return undefined
  const vatCode = Number(process.env.YOOKASSA_VAT_CODE || 1)
  const customer = {}
  if (user?.email) customer.email = user.email
  if (user?.phone) customer.phone = String(user.phone).replace(/\D/g, '')
  if (!customer.email && !customer.phone) return undefined

  return {
    customer,
    items: [
      {
        description: String(description || 'Оплата Ведело').slice(0, 128),
        quantity: '1.00',
        amount: {
          value: normalizeAmount(amount),
          currency: 'RUB',
        },
        vat_code: vatCode,
        payment_mode: 'full_payment',
        payment_subject: 'service',
      },
    ],
  }
}

const createYookassaPayment = async ({
  amount,
  description,
  metadata,
  returnUrl,
  idempotenceKey,
  user,
}) => {
  const value = normalizeAmount(amount)
  if (!value) throw new Error('Некорректная сумма платежа')
  const config = getYookassaConfig()
  if (!config.shopId || !config.secretKey) {
    throw new Error('ЮKassa не настроена')
  }

  const body = {
    amount: {
      value,
      currency: 'RUB',
    },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: returnUrl || config.returnUrl,
    },
    description: String(description || 'Оплата Ведело').slice(0, 128),
    metadata,
    receipt: buildReceipt({ amount, description, user }),
  }
  if (!body.receipt) delete body.receipt

  const response = await fetch(`${YOOKASSA_API_URL}/payments`, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
      'Idempotence-Key': idempotenceKey || crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.description || payload?.message || 'Ошибка ЮKassa')
  }
  return payload
}

const getYookassaPayment = async (paymentId) => {
  if (!paymentId) return null
  const config = getYookassaConfig()
  if (!config.shopId || !config.secretKey) {
    throw new Error('ЮKassa не настроена')
  }
  const response = await fetch(`${YOOKASSA_API_URL}/payments/${paymentId}`, {
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.description || payload?.message || 'Ошибка ЮKassa')
  }
  return payload
}

export {
  createYookassaPayment,
  getYookassaConfig,
  getYookassaPayment,
  isYookassaConfigured,
  normalizeAmount,
}
