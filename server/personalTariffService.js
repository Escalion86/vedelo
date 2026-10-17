import { randomUUID } from 'node:crypto'
import {
  billingIdentity,
  billingSnapshot,
  canSelectTariff,
  hasRemainingTariffPeriod,
  sameTariffId,
} from '../helpers/personalTariffs.mjs'
import { addMonths, calculateTariffCredit } from './billingCalculations.js'
import { isRegistrationOfferTariff } from '../helpers/tariffAccess.js'

const failure = (error, status = 409) => ({ ok: false, error, status })

export const createPersonalTariffService = ({ Users, Tariffs, Payments }) => {
  const flushReceipt = async (user) => {
    const receipt = user.pendingBillingReceipt
    if (!receipt) return
    for (const entry of receipt.entries) {
      const filter = { ...entry.identity }
      await Payments.updateOne(
        filter,
        { $setOnInsert: entry.values },
        { upsert: true }
      )
    }
    await Users.updateOne(
      { ...billingIdentity(user), 'pendingBillingReceipt.key': receipt.key },
      {
        $set: { pendingBillingReceipt: null },
      }
    )
  }

  const change = async ({
    user,
    tariff,
    now = new Date(),
    scheduled = false,
    admin = false,
    skipCompensation = false,
  }) => {
    if (!tariff || (!admin && !canSelectTariff(user, tariff)))
      return failure('Тариф недоступен', 403)
    if (!scheduled && sameTariffId(user.tariffId, tariff._id))
      return failure('Этот тариф уже подключён')
    if (
      scheduled &&
      (!user.pendingTariffChange ||
        new Date(user.pendingTariffChange.startsAt) > now)
    )
      return failure('Срок перехода ещё не наступил')
    await flushReceipt(user)
    const currentTariff =
      !scheduled &&
      !skipCompensation &&
      !isRegistrationOfferTariff(user) &&
      user.tariffId
        ? await Tariffs.findById(user.tariffId).lean()
        : null
    const credit =
      scheduled || skipCompensation
        ? 0
        : calculateTariffCredit({
            currentTariff,
            tariffActiveUntil: user.tariffActiveUntil,
            now,
          })
    const price = Number(tariff.price ?? 0)
    if (!Number.isFinite(price) || price < 0)
      return failure('Некорректная стоимость тарифа', 400)
    const balance = Number(user.balance ?? 0) + credit
    if (!Number.isFinite(balance) || balance < price)
      return failure('Недостаточно средств для подключения тарифа', 402)
    const key = randomUUID()
    const entries = []
    const entry = (suffix, amount, type, selected, comment) => ({
      identity: {
        tenantId: user.tenantId ?? user._id,
        userId: user._id,
        idempotenceKey: `tariff:${key}:${suffix}`,
      },
      values: {
        tariffId: selected._id,
        amount,
        type,
        source: 'system',
        purpose: 'tariff',
        status: 'succeeded',
        comment,
        paidAt: now,
      },
    })
    if (credit > 0)
      entries.push(
        entry(
          'refund',
          credit,
          'refund',
          currentTariff,
          `Компенсация за неиспользованный период тарифа "${currentTariff.title}"`
        )
      )
    if (price > 0)
      entries.push(
        entry(
          'charge',
          price,
          'charge',
          tariff,
          `Оплата тарифа "${tariff.title}"`
        )
      )
    const until = price > 0 ? addMonths(now, 1) : null
    const updated = await Users.findOneAndUpdate(
      { ...billingSnapshot(user), pendingBillingReceipt: null },
      {
        $set: {
          tariffId: tariff._id,
          balance: balance - price,
          tariffActiveUntil: until,
          nextChargeAt: until,
          billingStatus: 'active',
          pendingTariffChange: null,
          pendingBillingReceipt: entries.length ? { key, entries } : null,
        },
        $inc: { billingRevision: 1 },
      },
      { returnDocument: 'after' }
    )
      .select('+pendingBillingReceipt')
      .lean()
    if (!updated)
      return failure('Данные тарифа изменились. Обновите страницу и повторите')
    // A failed ledger write is retried by renewal; never charge again.
    await flushReceipt(updated)
    delete updated.pendingBillingReceipt
    return { ok: true, user: updated, tariff }
  }

  const schedule = async ({
    user,
    tariff,
    admin = false,
    now = new Date(),
  }) => {
    if (!tariff || (!admin && !canSelectTariff(user, tariff)))
      return failure('Тариф недоступен', 403)
    if (!hasRemainingTariffPeriod(user, now))
      return failure('Текущий период уже завершён. Подключите тариф сейчас')
    if (sameTariffId(user.tariffId, tariff._id))
      return failure('Этот тариф уже подключён')
    const update = {
      $set: {
        pendingTariffChange: {
          tariffId: tariff._id,
          startsAt: user.tariffActiveUntil,
        },
      },
      $inc: { billingRevision: 1 },
    }
    // Explicit admin assignment grants only this particular hidden tariff.
    if (admin && tariff.hidden)
      update.$addToSet = { allowedTariffIds: tariff._id }
    const updated = await Users.findOneAndUpdate(
      billingSnapshot(user),
      update,
      { returnDocument: 'after' }
    ).lean()
    return updated
      ? { ok: true, user: updated }
      : failure('Данные изменились. Обновите страницу и повторите')
  }

  const cancel = async (user) => {
    const updated = await Users.findOneAndUpdate(
      billingSnapshot(user),
      {
        $set: { pendingTariffChange: null },
        $inc: { billingRevision: 1 },
      },
      { returnDocument: 'after' }
    ).lean()
    return updated
      ? { ok: true, user: updated }
      : failure('Данные изменились. Обновите страницу и повторите')
  }

  const grant = async ({ user, tariff, enabled }) => {
    if (!tariff?.hidden) return failure('Выберите скрытый тариф', 400)
    const update = {
      $inc: { billingRevision: 1 },
      [enabled ? '$addToSet' : '$pull']: { allowedTariffIds: tariff._id },
    }
    if (
      !enabled &&
      sameTariffId(user.pendingTariffChange?.tariffId, tariff._id)
    )
      update.$set = { pendingTariffChange: null }
    const updated = await Users.findOneAndUpdate(
      billingSnapshot(user),
      update,
      { returnDocument: 'after' }
    ).lean()
    return updated
      ? { ok: true, user: updated }
      : failure('Данные изменились. Обновите страницу и повторите')
  }

  const renewScheduled = async (now = new Date()) => {
    const receipts = await Users.find({ pendingBillingReceipt: { $ne: null } })
      .select('+pendingBillingReceipt')
      .lean()
    for (const user of receipts) await flushReceipt(user)
    const users = await Users.find({
      'pendingTariffChange.startsAt': { $lte: now },
    }).lean()
    let changed = 0
    for (const user of users) {
      const tariff = await Tariffs.findById(
        user.pendingTariffChange.tariffId
      ).lean()
      if (!canSelectTariff(user, tariff)) {
        await cancel(user)
        continue
      }
      const result = await change({ user, tariff, now, scheduled: true })
      if (result.ok) {
        changed++
        continue
      }
      if (result.status !== 402) continue
      const free = await Tariffs.findOne({
        hidden: { $ne: true },
        price: { $lte: 0 },
      }).lean()
      // Preserve the proposal and retry after top-up, without renewing the old plan.
      await Users.updateOne(billingSnapshot(user), {
        $set: {
          tariffId: free?._id ?? null,
          tariffActiveUntil: null,
          nextChargeAt: null,
          billingStatus: 'debt',
        },
        $inc: { billingRevision: 1 },
      })
    }
    return changed
  }
  return { change, schedule, cancel, grant, renewScheduled, flushReceipt }
}
