export const normalizePromoCode = (value) =>
  typeof value === 'string' ? value.trim().toUpperCase() : ''

export const validatePromoCode = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return { error: 'Проверьте настройки промокода' }
  const code = normalizePromoCode(body.code)
  if (!/^[A-Z0-9_-]{3,40}$/.test(code))
    return {
      error: 'Код: 3–40 латинских букв, цифр, дефисов или подчёркиваний',
    }
  const amount = body.amount
  if (
    typeof amount !== 'number' ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > 1000000 ||
    Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001
  )
    return {
      error: 'Сумма: от 0 до 1 000 000 ₽, не более двух знаков после запятой',
    }
  const tariffId = body.tariffId || null
  if (
    tariffId !== null &&
    (typeof tariffId !== 'string' || !/^[a-f\d]{24}$/i.test(tariffId))
  )
    return { error: 'Выберите скрытый тариф' }
  if (!amount && !tariffId) return { error: 'Укажите сумму или скрытый тариф' }
  const expiresAt =
    typeof body.expiresAt === 'string' ? new Date(body.expiresAt) : null
  if (!expiresAt || !Number.isFinite(expiresAt.getTime()))
    return { error: 'Укажите срок действия промокода' }
  if (typeof body.enabled !== 'boolean')
    return { error: 'Укажите состояние промокода' }
  if (typeof body.comment !== 'string' || body.comment.length > 2000)
    return { error: 'Комментарий: не более 2000 символов' }
  return {
    data: {
      code,
      amount,
      tariffId,
      expiresAt,
      enabled: body.enabled,
      comment: body.comment.trim(),
    },
  }
}
