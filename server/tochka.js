const TOCHKA_API_URL = 'https://enter.tochka.com/uapi'

// Public RSA JWK used to verify Tochka webhook JWT signatures.
// It contains only public key fields and can be rotated via TOCHKA_WEBHOOK_PUBLIC_JWK.
const TOCHKA_WEBHOOK_JWK = {
  kty: 'RSA',
  e: 'AQAB',
  n: 'rwm77av7GIttq-JF1itEgLCGEZW_zz16RlUQVYlLbJtyRSu61fCec_rroP6PxjXU2uLzUOaGaLgAPeUZAJrGuVp9nryKgbZceHckdHDYgJd9TsdJ1MYUsXaOb9joN9vmsCscBx1lwSlFQyNQsHUsrjuDk-opf6RCuazRQ9gkoDCX70HV8WBMFoVm-YWQKJHZEaIQxg_DU4gMFyKRkDGKsYKA0POL-UgWA1qkg6nHY5BOMKaqxbc5ky87muWB5nNk4mfmsckyFv9j1gBiXLKekA_y4UwG2o1pbOLpJS3bP_c95rm4M9ZBmGXqfOQhbjz8z-s9C11i-jmOQ2ByohS-ST3E5sqBzIsxxrxyQDTw--bZNhzpbciyYW4GfkkqyeYoOPd_84jPTBDKQXssvj8ZOj2XboS77tvEO1n1WlwUzh8HPCJod5_fEgSXuozpJtOggXBv0C2ps7yXlDZf-7Jar0UYc_NJEHJF-xShlqd6Q3sVL02PhSCM-ibn9DN9BKmD',
}

const getTochkaConfig = () => {
  const apiUrl = String(process.env.TOCHKA_API_URL || TOCHKA_API_URL).replace(/\/$/, '')
  const token = String(process.env.TOCHKA_API_TOKEN || '').trim()
  const clientId = String(process.env.TOCHKA_CLIENT_ID || '').trim()
  const customerCode = String(process.env.TOCHKA_CUSTOMER_CODE || '').trim()
  const merchantId = String(process.env.TOCHKA_MERCHANT_ID || '').trim()
  const returnUrl = String(
    process.env.TOCHKA_RETURN_URL ||
      `${process.env.DOMAIN || 'https://vedelo.ru'}/cabinet/tariff-select?payment=tochka`
  ).trim()
  return { apiUrl, token, clientId, customerCode, merchantId, returnUrl }
}

const isTochkaConfigured = () => {
  const { token, customerCode, merchantId } = getTochkaConfig()
  return Boolean(token && customerCode && merchantId)
}

const normalizeAmount = (amount) => {
  const value = Number(amount)
  if (!Number.isFinite(value) || value <= 0) return ''
  return value.toFixed(2)
}

const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '')

const normalizeEmail = (email) => String(email || '').trim()

const getAuthHeaders = () => {
  const { token } = getTochkaConfig()
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

const readPayload = async (response) => {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

const extractTochkaError = (payload) => {
  const errors = payload?.Errors || payload?.errors || payload?.Data?.Errors
  if (Array.isArray(errors) && errors.length > 0) {
    return errors
      .map((item) =>
        [
          item?.code || item?.Code,
          item?.message || item?.Message || item?.error || item?.Error,
        ]
          .filter(Boolean)
          .join(': ')
      )
      .filter(Boolean)
      .join('; ')
  }
  return (
    payload?.message ||
    payload?.Message ||
    payload?.error_description ||
    payload?.error ||
    payload?.Error ||
    payload?.raw ||
    ''
  )
}

const getValue = (source, paths) => {
  for (const path of paths) {
    const value = path.split('.').reduce((acc, key) => acc?.[key], source)
    if (value !== undefined && value !== null && value !== '') return value
  }
  return ''
}

const createTochkaRequest = async ({ pathName, method = 'GET', body }) => {
  const config = getTochkaConfig()
  if (!config.token) throw new Error('Точка не настроена')

  const response = await fetch(`${config.apiUrl}${pathName}`, {
    method,
    headers: getAuthHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await readPayload(response)
  if (!response.ok) {
    throw new Error(extractTochkaError(payload) || 'Ошибка Точки')
  }
  return payload
}

const buildReceiptClient = (user) => {
  const phone = normalizePhone(user?.phone)
  const email = normalizeEmail(user?.email || process.env.TOCHKA_RECEIPT_EMAIL)
  if (!phone && !email) return null
  return {
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
  }
}

const buildReceiptItems = ({ amount, description }) => {
  const itemName = String(
    process.env.TOCHKA_RECEIPT_ITEM_NAME || description || 'Оплата Ведело'
  ).slice(0, 128)

  return [
    {
      name: itemName,
      amount: normalizeAmount(amount),
      quantity: 1,
      vatType: process.env.TOCHKA_VAT_TYPE || 'none',
      paymentMethod: process.env.TOCHKA_PAYMENT_METHOD || 'full_payment',
      paymentObject: process.env.TOCHKA_PAYMENT_OBJECT || 'service',
      measure: process.env.TOCHKA_MEASURE || 'шт.',
    },
  ]
}

const createTochkaPayment = async ({
  amount,
  description,
  idempotenceKey,
  returnUrl,
  user,
}) => {
  const value = normalizeAmount(amount)
  if (!value) throw new Error('Некорректная сумма платежа')
  const config = getTochkaConfig()
  if (!isTochkaConfigured()) throw new Error('Точка не настроена')

  const client = buildReceiptClient(user)
  if (process.env.TOCHKA_SEND_RECEIPT === 'true' && !client) {
    throw new Error('Для чека Точки нужен телефон или email пользователя')
  }
  if (process.env.TOCHKA_SEND_RECEIPT === 'true' && !client?.email) {
    throw new Error('Для чека Точки нужен email пользователя')
  }

  const taxSystemCode = process.env.TOCHKA_TAX_SYSTEM_CODE || 'npd'
  const allowedTaxSystemCodes = new Set([
    'osn',
    'usn_income',
    'usn_income_outcome',
    'esn',
    'patent',
  ])
  if (
    process.env.TOCHKA_SEND_RECEIPT === 'true' &&
    !allowedTaxSystemCodes.has(taxSystemCode)
  ) {
    throw new Error(
      `Точка не поддерживает taxSystemCode=${taxSystemCode}. Доступны: osn, usn_income, usn_income_outcome, esn, patent`
    )
  }

  const body = {
    Data: {
      customerCode: config.customerCode,
      amount: value,
      purpose: String(description || 'Оплата Ведело').slice(0, 140),
      redirectUrl: returnUrl || config.returnUrl,
      failRedirectUrl: returnUrl || config.returnUrl,
      paymentMode: ['sbp'],
      merchantId: config.merchantId,
      ttl: Number(process.env.TOCHKA_PAYMENT_TTL || 1440),
      taxSystemCode,
      Client: client,
      Items: buildReceiptItems({ amount, description }),
      preAuthorization: false,
    },
  }
  if (idempotenceKey) body.Data.paymentLinkId = idempotenceKey
  if (process.env.TOCHKA_SEND_RECEIPT !== 'true') {
    delete body.Data.Client
    delete body.Data.Items
    delete body.Data.taxSystemCode
  }

  return createTochkaRequest({
    pathName:
      process.env.TOCHKA_SEND_RECEIPT === 'true'
        ? '/acquiring/v1.0/payments_with_receipt'
        : '/acquiring/v1.0/payments',
    method: 'POST',
    body,
  })
}

const getTochkaPayment = async (operationId) => {
  if (!operationId) return null
  return createTochkaRequest({
    pathName: `/acquiring/v1.0/payments/${encodeURIComponent(operationId)}`,
  })
}

const extractTochkaPayment = (payload) =>
  payload?.Data?.Operation ||
  payload?.Data?.Payment ||
  payload?.Data?.payment ||
  payload?.Operation ||
  payload?.Payment ||
  payload ||
  {}

const getTochkaOperationId = (payload) =>
  String(
    getValue(payload, [
      'Data.Operation.operationId',
      'Data.Operation.id',
      'Data.operationId',
      'Data.paymentId',
      'operationId',
      'id',
    ])
  ).trim()

const getTochkaPaymentUrl = (payload) =>
  String(
    getValue(payload, [
      'Data.Operation.paymentLink',
      'Data.Operation.paymentLinkUrl',
      'Data.Operation.paymentUrl',
      'Data.Operation.url',
      'Data.paymentLink',
      'Data.paymentUrl',
      'paymentLink',
      'paymentUrl',
      'url',
    ])
  ).trim()

export {
  TOCHKA_WEBHOOK_JWK,
  createTochkaPayment,
  extractTochkaPayment,
  getTochkaConfig,
  getTochkaOperationId,
  getTochkaPayment,
  getTochkaPaymentUrl,
  isTochkaConfigured,
  normalizeAmount,
}
