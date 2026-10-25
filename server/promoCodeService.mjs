import { createHash } from 'node:crypto'
import {
  normalizePromoCode,
  validatePromoCode,
} from '../helpers/promoCodes.mjs'

export const promoCodeKey = (code) =>
  createHash('sha256').update(normalizePromoCode(code)).digest('hex')
const fail = (error, status = 400) => ({ ok: false, error, status })
const identity = (user) => ({
  _id: user._id,
  tenantId: user.tenantId ?? null,
  archive: { $ne: true },
})

export const createPromoCodeService = ({
  Users,
  PromoCodes,
  Tariffs,
  Payments,
}) => {
  const save = async (body) => {
    const validated = validatePromoCode(body)
    if (validated.error) return fail(validated.error)
    const data = validated.data
    if (
      data.tariffId &&
      !(await Tariffs.exists({ _id: data.tariffId, hidden: true }))
    )
      return fail('Скрытый тариф не найден')
    const key = promoCodeKey(data.code)
    if (body.revision === undefined) {
      try {
        const row = await PromoCodes.create({ _id: key, ...data })
        return { ok: true, data: row.toObject() }
      } catch (error) {
        if (error.code === 11000)
          return fail('Такой промокод уже существует', 409)
        throw error
      }
    }
    if (!Number.isSafeInteger(body.revision) || body.revision < 0)
      return fail('Некорректная версия промокода')
    const row = await PromoCodes.findOneAndUpdate(
      { _id: key, revision: body.revision, deleting: { $ne: true } },
      { $set: data, $inc: { revision: 1 } },
      { returnDocument: 'after', runValidators: true }
    ).lean()
    return row
      ? { ok: true, data: row }
      : fail('Промокод изменён. Обновите список и повторите правки', 409)
  }

  const ensurePayment = async (user, key, receipt) => {
    if (!receipt.amount) return
    const tenantId = user.tenantId || user._id
    const id = createHash('sha256')
      .update(`vedelo:promo:${user._id}:${key}`)
      .digest('hex')
      .slice(0, 24)
    const filter = { _id: id, tenantId, userId: user._id }
    try {
      await Payments.updateOne(
        filter,
        {
          $setOnInsert: {
            ...filter,
            amount: receipt.amount,
            type: 'topup',
            source: 'system',
            purpose: 'balance',
            status: 'succeeded',
            paidAt: receipt.appliedAt,
            createdAt: receipt.appliedAt,
            idempotenceKey: `promo:${key}`,
            comment: `Бонус по промокоду ${receipt.code}`,
          },
        },
        { upsert: true, timestamps: false }
      )
    } catch (error) {
      if (error.code !== 11000 || !(await Payments.exists(filter))) throw error
    }
  }

  const redeem = async ({ user: actor, tenantId, code: rawCode }) => {
    if (!actor?._id || !tenantId) return fail('Не авторизован', 401)
    if (String(actor.tenantId || actor._id) !== String(tenantId))
      return fail('Нет доступа', 403)
    const code = normalizePromoCode(rawCode)
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return fail('Проверьте промокод')
    const key = promoCodeKey(code)
    const path = `promoRedemptions.${key}`
    let user = await Users.findOne(identity(actor))
      .select('+promoRedemptions')
      .lean()
    if (!user) return fail('Нет доступа', 403)
    let receipt = user.promoRedemptions?.[key]
    let alreadyUsed = Boolean(receipt)
    if (!receipt) {
      const promo = await PromoCodes.findOneAndUpdate(
        {
          _id: key,
          enabled: true,
          deleting: { $ne: true },
          expiresAt: { $gt: new Date() },
        },
        { $inc: { activeRedemptions: 1 } },
        { returnDocument: 'after' }
      ).lean()
      if (!promo)
        return fail('Промокод не найден, отключён или срок его действия истёк')
      try {
        const tariff = promo.tariffId
          ? await Tariffs.findOne({ _id: promo.tariffId, hidden: true }).lean()
          : null
        if (promo.tariffId && !tariff)
          return fail('Тариф промокода недоступен. Обратитесь в поддержку', 409)
        receipt = {
          code,
          amount: promo.amount,
          tariffId: tariff?._id || null,
          tariffTitle: tariff?.title || '',
          appliedAt: new Date(),
          revision: promo.revision,
        }
        const update = {
          $set: { [path]: receipt },
          $inc: { balance: promo.amount, billingRevision: 1 },
        }
        if (tariff) update.$addToSet = { allowedTariffIds: tariff._id }
        // Balance, grant and receipt share one atomic document update on standalone MongoDB.
        const changed = await Users.updateOne(
          {
            ...identity(user),
            [path]: { $exists: false },
            $expr: { $lt: ['$$NOW', promo.expiresAt] },
          },
          update
        )
        if (!changed.matchedCount) {
          user = await Users.findOne(identity(user))
            .select('+promoRedemptions')
            .lean()
          receipt = user?.promoRedemptions?.[key]
          if (!receipt)
            return fail('Срок действия истёк или аккаунт недоступен', 409)
          alreadyUsed = true
        }
      } finally {
        await PromoCodes.updateOne(
          { _id: key },
          { $inc: { activeRedemptions: -1 } }
        )
      }
    }
    // A lost response/ledger failure is recoverable even after expiry or disabling.
    await ensurePayment(user, key, receipt)
    return {
      ok: true,
      data: {
        code: receipt.code,
        amount: receipt.amount,
        tariffTitle: receipt.tariffTitle,
        tariffId: receipt.tariffId,
        alreadyUsed,
      },
    }
  }
  // Global admin reporting deliberately spans tenants; never exposed by user CRUD.
  const receiptDto = (receipt) => ({
    code: receipt.code,
    amount: receipt.amount,
    tariffTitle: receipt.tariffTitle,
    appliedAt: receipt.appliedAt,
  })
  const list = async () => {
    const [rows, counts] = await Promise.all([
      PromoCodes.find({}).sort({ createdAt: -1 }).lean(),
      Users.aggregate([
        {
          $project: {
            entries: { $objectToArray: { $ifNull: ['$promoRedemptions', {}] } },
          },
        },
        { $unwind: '$entries' },
        { $group: { _id: '$entries.k', count: { $sum: 1 } } },
      ]),
    ])
    const byKey = new Map(counts.map((row) => [row._id, row.count]))
    return rows.map(({ activeRedemptions, deleting, ...row }) => ({
      ...row,
      usageCount: byKey.get(row._id) || 0,
      canDelete: !byKey.get(row._id) && !activeRedemptions && !deleting,
    }))
  }
  const remove = async (body) => {
    if (
      !body ||
      typeof body.code !== 'string' ||
      !/^[A-Z0-9_-]{3,40}$/.test(body.code) ||
      !Number.isSafeInteger(body.revision) ||
      body.revision < 0
    )
      return fail('Некорректный промокод')
    const key = promoCodeKey(body.code)
    const locked = await PromoCodes.findOneAndUpdate(
      {
        _id: key,
        revision: body.revision,
        deleting: { $ne: true },
        $or: [
          { activeRedemptions: 0 },
          { activeRedemptions: { $exists: false } },
        ],
      },
      { $set: { deleting: true } }
    ).lean()
    if (!locked)
      return fail('Промокод изменён или активируется. Обновите список', 409)
    let deleted = false
    try {
      if (
        await Users.exists({ [`promoRedemptions.${key}`]: { $exists: true } })
      )
        return fail('Использованный промокод нельзя удалить', 409)
      await PromoCodes.deleteOne({ _id: key, deleting: true })
      deleted = true
      return { ok: true }
    } finally {
      if (!deleted)
        await PromoCodes.updateOne(
          { _id: key, deleting: true },
          { $set: { deleting: false } }
        )
    }
  }
  const usages = async (code, page = 0) => {
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return fail('Некорректный промокод')
    const key = promoCodeKey(code)
    const field = `promoRedemptions.${key}`
    const rows = await Users.find({ [field]: { $exists: true } })
      .select(
        `_id firstName secondName thirdName phone archive +promoRedemptions`
      )
      .sort({ _id: 1 })
      .skip(page * 50)
      .limit(51)
      .lean()
    return {
      ok: true,
      data: {
        hasMore: rows.length > 50,
        users: rows.slice(0, 50).map((user) => ({
          _id: user._id,
          firstName: user.firstName,
          secondName: user.secondName,
          thirdName: user.thirdName,
          phone: user.phone,
          archive: Boolean(user.archive),
          ...receiptDto(user.promoRedemptions[key]),
        })),
      },
    }
  }
  const userHistory = async (id) => {
    if (!/^[a-f0-9]{24}$/i.test(id)) return fail('Некорректный пользователь')
    const owner = await Users.findById(id).select('_id tenantId').lean()
    if (!owner) return fail('Пользователь не найден', 404)
    const user = await Users.findOne({
      _id: owner._id,
      tenantId: owner.tenantId ?? null,
    })
      .select('+promoRedemptions')
      .lean()
    if (!user) return fail('Пользователь не найден', 404)
    return {
      ok: true,
      data: Object.values(user.promoRedemptions || {})
        .map(receiptDto)
        .sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt)),
    }
  }
  return { save, redeem, list, remove, usages, userHistory }
}
