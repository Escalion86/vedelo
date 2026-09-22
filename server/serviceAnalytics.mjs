export const DAY = 86400000
export const analyticsAccessStatus = (context) =>
  !context?.user?._id || !context?.tenantId
    ? 401
    : context.user.role === 'dev'
      ? 200
      : 403

export function analyticsRange(params, now = new Date()) {
  const today = now.toISOString().slice(0, 10)
  const parse = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || ''))
      throw new Error('Укажите корректные даты')
    const date = new Date(`${value}T00:00:00.000Z`)
    if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value)
      throw new Error('Укажите корректные даты')
    return date
  }
  const to = parse(params.get('to') || today)
  const from = parse(
    params.get('from') || new Date(+to - 29 * DAY).toISOString().slice(0, 10)
  )
  const days = (+to - +from) / DAY + 1
  if (days < 1 || days > 366 || +to > +parse(today))
    throw new Error('Выберите от 1 до 366 дней, не позднее сегодня')
  const end = new Date(Math.min(+to + DAY, +now))
  const previousStart = new Date(+from - days * DAY)
  // Compare the same elapsed portion when the current day is incomplete.
  const previousEnd = new Date(+previousStart + (+end - +from))
  const excluded = (params.get('exclude') || '')
    .toLowerCase()
    .split(',')
    .filter(Boolean)
  if (
    excluded.length > 100 ||
    excluded.some((id) => !/^[a-f\d]{24}$/i.test(id))
  )
    throw new Error('Некорректный список исключений (до 100 аккаунтов)')
  return { from, to, end, previousStart, previousEnd, days, excluded }
}

export const receiptFilter = {
  type: 'topup',
  source: { $in: ['tochka', 'yookassa'] },
  status: 'succeeded',
  amount: { $gt: 0 },
}
const eq = (field, value) => ({ $eq: [`$${field}`, value] })
export const paymentCategoryExpression = {
  $switch: {
    branches: [
      {
        case: {
          $and: [
            eq('type', 'topup'),
            { $in: ['$source', ['tochka', 'yookassa']] },
          ],
        },
        then: 'receipts',
      },
      { case: eq('type', 'refund'), then: 'refunds' },
      {
        case: { $and: [eq('type', 'topup'), eq('source', 'manual')] },
        then: 'manual',
      },
      { case: eq('type', 'topup'), then: 'bonuses' },
      { case: eq('purpose', 'ai'), then: 'ai' },
      {
        case: {
          $or: [
            eq('purpose', 'tariff'),
            {
              $and: [
                eq('source', 'system'),
                { $ne: [{ $ifNull: ['$tariffId', null] }, null] },
              ],
            },
          ],
        },
        then: 'tariffs',
      },
    ],
    default: 'charges',
  },
}

const blank = () => ({
  registrations: 0,
  receipts: 0,
  payments: 0,
  payers: 0,
  firstPayers: 0,
  repeatPayments: 0,
  tariffs: 0,
  ai: 0,
  bonuses: 0,
  manual: 0,
  refunds: 0,
  charges: 0,
  pending: 0,
  failed: 0,
  canceled: 0,
  mature: 0,
  converted: 0,
})
const within = (value, from, to) =>
  value && +new Date(value) >= +from && +new Date(value) < +to

export function summarizeAnalytics({
  users,
  groups,
  firstPayments,
  tariffs,
  range,
  now = new Date(),
}) {
  const first = new Map(firstPayments.map((row) => [String(row._id), row.at]))
  const selected = users.filter(
    (u) =>
      !['dev', 'admin'].includes(u.role) &&
      !range.excluded.includes(String(u._id))
  )
  const ids = new Set(selected.map((u) => String(u._id)))
  const current = blank(),
    previous = blank()
  const payers = { current: new Set(), previous: new Set() }
  const daily = Array.from({ length: range.days }, (_, i) => ({
    date: new Date(+range.from + i * DAY).toISOString().slice(0, 10),
    registrations: 0,
    receipts: 0,
  }))
  const byDay = new Map(daily.map((row) => [row.date, row]))
  const sources = new Map(),
    distribution = new Map()
  const funnel = {
    registered: 0,
    onboarding: 0,
    order: 0,
    action: 0,
    activated: 0,
    paid: 0,
  }
  const details = []
  const tariffNames = new Map(tariffs.map((t) => [String(t._id), t.title]))
  for (const u of selected) {
    const id = String(u._id),
      paidAt = first.get(id),
      f = u.acquisitionFunnel || {}
    const inCurrent = within(u.createdAt, range.from, range.end)
    const target = inCurrent
      ? current
      : within(u.createdAt, range.previousStart, range.previousEnd)
        ? previous
        : null
    const mature = +new Date(u.createdAt) + 30 * DAY <= +now
    const converted =
      mature &&
      paidAt &&
      +new Date(paidAt) >= +new Date(u.createdAt) &&
      +new Date(paidAt) < +new Date(u.createdAt) + 30 * DAY
    if (target) {
      target.registrations++
      if (mature) target.mature++
      if (converted) target.converted++
    }
    if (inCurrent) {
      byDay.get(new Date(u.createdAt).toISOString().slice(0, 10))
        .registrations++
      funnel.registered++
      for (const [key, field] of [
        ['onboarding', 'onboardingCompletedAt'],
        ['order', 'firstCrmItemCreatedAt'],
        ['action', 'firstNextActionAt'],
        ['activated', 'activatedAt'],
      ]) {
        if (f[field] && +new Date(f[field]) <= +now) funnel[key]++
      }
      if (paidAt && +new Date(paidAt) <= +now) funnel.paid++
      const source =
        u.acquisition?.source || u.registrationSource || 'Без источника'
      const campaign = u.acquisition?.campaign || 'Без кампании'
      const key = JSON.stringify([source, campaign])
      const row = sources.get(key) || {
        source,
        campaign,
        registered: 0,
        orders: 0,
        paid: 0,
        mature: 0,
        converted: 0,
      }
      row.registered++
      if (f.firstCrmItemCreatedAt) row.orders++
      if (paidAt) row.paid++
      if (mature) row.mature++
      if (converted) row.converted++
      sources.set(key, row)
    }
    const active = u.tariffActiveUntil && +new Date(u.tariffActiveUntil) > +now
    const trial = u.trialEndsAt && +new Date(u.trialEndsAt) > +now
    const assigned = tariffNames.get(String(u.tariffId))
    const tariff = assigned
      ? `${assigned}${u.tariffActiveUntil && !active && !trial ? ' (срок истёк)' : ''}`
      : trial
        ? 'Пробный доступ без тарифа'
        : 'Тариф не назначен'
    const tariffRow = distribution.get(tariff) || {
      title: tariff,
      total: 0,
      trial: 0,
      other: 0,
    }
    tariffRow.total++
    if (trial) tariffRow.trial++
    else tariffRow.other++
    distribution.set(tariff, tariffRow)
    details.push({
      id,
      name:
        [u.secondName, u.firstName].filter(Boolean).join(' ') ||
        `Аккаунт …${id.slice(-6)}`,
      registeredAt: u.createdAt,
      firstPaymentAt: paidAt || null,
      newUser: inCurrent,
      mature: Boolean(mature),
      converted: Boolean(converted),
      receipts: 0,
      payments: 0,
      tariff,
      expiresSoon: Boolean(
        active && +new Date(u.tariffActiveUntil) < +now + 7 * DAY
      ),
    })
  }
  const byUser = new Map(details.map((u) => [u.id, u]))
  for (const g of groups) {
    const id = String(g._id.userId)
    if (!ids.has(id)) continue
    const period = g._id.period,
      target = period === 'current' ? current : previous
    const { category, status, day } = g._id
    if (status !== 'succeeded') {
      if (['pending', 'failed', 'canceled'].includes(status))
        target[status] += g.count
      continue
    }
    target[category] += g.amount
    if (category === 'receipts') {
      target.payments += g.count
      payers[period].add(id)
      if (period === 'current') {
        if (byDay.has(day)) byDay.get(day).receipts += g.amount
        byUser.get(id).receipts += g.amount
        byUser.get(id).payments += g.count
      }
    }
  }
  for (const [period, target, start, end] of [
    ['current', current, range.from, range.end],
    ['previous', previous, range.previousStart, range.previousEnd],
  ]) {
    target.payers = payers[period].size
    target.firstPayers = [...payers[period]].filter((id) =>
      within(first.get(id), start, end)
    ).length
    target.repeatPayments = target.payments - target.firstPayers
    target.average = target.payments ? target.receipts / target.payments : null
    target.conversion = target.mature
      ? (100 * target.converted) / target.mature
      : null
  }
  return {
    current,
    previous,
    daily,
    sources: [...sources.values()].sort((a, b) => b.registered - a.registered),
    funnel,
    distribution: [...distribution.values()],
    users: details,
    excludedOptions: users
      .filter((u) => !['dev', 'admin'].includes(u.role))
      .map((u) => ({
        id: String(u._id),
        name:
          [u.secondName, u.firstName].filter(Boolean).join(' ') ||
          `Аккаунт …${String(u._id).slice(-6)}`,
      })),
    expiring: details.filter((u) => u.expiresSoon).length,
  }
}
