import { createHash } from 'node:crypto'

const fail = (message, status = 400) => {
  const error = new Error(message)
  error.status = status
  throw error
}

export const canManageBalance = (context) =>
  Boolean(
    context?.user?._id &&
    context?.tenantId &&
    ['admin', 'dev'].includes(context.user.role)
  )

export const parseManualCharge = (body, now = new Date()) => {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    fail('Некорректная операция')
  if (typeof body.userId !== 'string' || !/^[a-f\d]{24}$/i.test(body.userId))
    fail('Некорректный пользователь')
  const amount = Number(body.amount)
  if (
    !['number', 'string'].includes(typeof body.amount) ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > 100000000 ||
    Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001
  )
    fail('Укажите положительную сумму с точностью до копеек')
  if (
    typeof body.comment !== 'string' ||
    !body.comment.trim() ||
    body.comment.trim().length > 240
  )
    fail('Укажите причину списания (до 240 символов)')
  if (!['balance', 'tariff'].includes(body.purpose))
    fail('Некорректная причина списания')
  const paidAt =
    typeof body.paidAt === 'string' ? new Date(body.paidAt) : new Date(NaN)
  if (!Number.isFinite(paidAt.getTime()) || paidAt > now)
    fail('Укажите корректную дату списания, не позднее текущего времени')
  if (
    typeof body.idempotenceKey !== 'string' ||
    !/^[a-z\d-]{16,80}$/i.test(body.idempotenceKey)
  )
    fail('Не указан ключ операции')
  return {
    userId: body.userId,
    amount: Math.round(amount * 100) / 100,
    comment: body.comment.trim(),
    purpose: body.purpose,
    paidAt,
    idempotenceKey: body.idempotenceKey,
  }
}

// An atomic receipt on Users protects standalone MongoDB as well as replica sets.
// A failed response/finalization can be retried with the same key without a second debit.
export const createManualCharge = async ({
  context,
  body,
  UsersModel,
  PaymentsModel,
}) => {
  if (!canManageBalance(context))
    fail('Нет доступа', context?.user?._id ? 403 : 401)
  const input = parseManualCharge(body)
  const target = await UsersModel.findById(input.userId)
  if (!target) fail('Пользователь не найден', 404)
  const tenantId = target.tenantId || target._id
  const id = createHash('sha256')
    .update(
      `vedelo:manual-charge:${tenantId}:${input.userId}:${input.idempotenceKey}`
    )
    .digest('hex')
    .slice(0, 24)
  const paymentFilter = { _id: id, userId: target._id, tenantId }
  const userFilter = { _id: target._id, tenantId: target.tenantId ?? null }
  const receipt = `manualBalanceCharges.${id}`
  const reversal = `paymentReversals.${id}`
  const wasDeleted = await UsersModel.exists({
    ...userFilter,
    [reversal]: true,
  })
  if (wasDeleted)
    fail('Это списание уже удалено. Создайте новую операцию.', 409)

  let payment
  try {
    payment = await PaymentsModel.findOneAndUpdate(
      paymentFilter,
      {
        $setOnInsert: {
          ...input,
          tariffId:
            input.purpose === 'tariff' ? (target.tariffId ?? null) : null,
          type: 'charge',
          source: 'manual',
          status: 'pending',
          createdAt: input.paidAt,
          recordedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: 'after', timestamps: false }
    )
  } catch (error) {
    if (error?.code !== 11000) throw error
    payment = await PaymentsModel.findOne(paymentFilter)
  }
  if (
    !payment ||
    payment.amount !== input.amount ||
    payment.comment !== input.comment ||
    payment.purpose !== input.purpose ||
    new Date(payment.paidAt).getTime() !== input.paidAt.getTime()
  )
    fail('Ключ операции уже использован с другими данными', 409)

  let updatedUser = await UsersModel.findOneAndUpdate(
    {
      ...userFilter,
      [receipt]: { $ne: true },
      [reversal]: { $ne: true },
      balance: { $gte: input.amount },
    },
    { $inc: { balance: -input.amount }, $set: { [receipt]: true } },
    { returnDocument: 'after' }
  )
  if (!updatedUser) {
    updatedUser = await UsersModel.findOne({
      ...userFilter,
      [receipt]: true,
      [reversal]: { $ne: true },
    })
    if (!updatedUser) {
      await PaymentsModel.updateOne(
        { ...paymentFilter, status: 'pending' },
        {
          $set: { status: 'failed' },
        }
      )
      fail('Недостаточно средств или операция уже удалена', 409)
    }
  }
  // Never upsert here: a concurrent deletion must not resurrect an operation.
  payment = await PaymentsModel.findOneAndUpdate(
    paymentFilter,
    { $set: { status: 'succeeded' } },
    { returnDocument: 'after' }
  )
  if (!payment) fail('Операция уже удалена', 409)
  return { user: updatedUser, payment }
}
