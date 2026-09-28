import SiteSettings from '@models/SiteSettings'
import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import { sendMultiChannelPushToTenant } from '@server/multiChannelPush'

export const BALANCE_WARNING_RUB = 100
const DAY_MS = 24 * 60 * 60 * 1000

export const getTelefonipBalance = async () => {
  const checkedAt = new Date().toISOString()
  if (!process.env.TELEFONIP)
    return { status: 'unconfigured', checkedAt, threshold: BALANCE_WARNING_RUB }
  try {
    const base = (
      process.env.TELEFONIP_API_BASE_URL || 'https://api.telefon-ip.ru'
    ).replace(/\/$/, '')
    const response = await fetch(
      `${base}/api/v1/authcalls/${encodeURIComponent(process.env.TELEFONIP)}/get_balance/`,
      { cache: 'no-store', signal: AbortSignal.timeout(15000) }
    )
    const json = await response.json()
    const value = json?.data?.balance
    if (
      !response.ok ||
      json?.success !== true ||
      !['number', 'string'].includes(typeof value) ||
      String(value).trim() === '' ||
      !Number.isFinite(Number(value))
    )
      throw new Error('Invalid balance')
    const balance = Number(value)
    return {
      status: balance <= BALANCE_WARNING_RUB ? 'low' : 'ok',
      balance,
      checkedAt,
      threshold: BALANCE_WARNING_RUB,
    }
  } catch {
    // Fetch errors can contain the API key embedded in the URL.
    return { status: 'error', checkedAt, threshold: BALANCE_WARNING_RUB }
  }
}

export const checkTelefonipBalance = async () => {
  try {
    const result = await getTelefonipBalance()
    if (['ok', 'unconfigured'].includes(result.status))
      return { status: result.status }
    await dbConnect()
    const developers = await Users.find({ role: 'dev', archive: { $ne: true } })
      .select('_id tenantId')
      .lean()
    const tenants = [
      ...new Set(developers.map((user) => String(user.tenantId || user._id))),
    ]
    if (!tenants.length) return { status: result.status, notified: 0 }
    await SiteSettings.updateOne(
      { tenantId: null },
      { $setOnInsert: { tenantId: null } },
      { upsert: true }
    )
    const now = new Date()
    const claim = await SiteSettings.updateOne(
      {
        tenantId: null,
        $or: [
          { 'telefonipBalance.lastAlertAt': { $exists: false } },
          { 'telefonipBalance.lastAlertAt': null },
          {
            'telefonipBalance.lastAlertAt': {
              $lte: new Date(now.getTime() - DAY_MS),
            },
          },
        ],
      },
      { $set: { 'telefonipBalance.lastAlertAt': now } }
    )
    if (claim.modifiedCount !== 1) return { status: result.status, notified: 0 }
    const payload = {
      title:
        result.status === 'low'
          ? 'Низкий баланс Telefon-IP'
          : 'Не удалось проверить баланс Telefon-IP',
      body:
        result.status === 'low'
          ? `Остаток ${result.balance.toLocaleString('ru-RU')} ₽. Пополните счёт для звонков и СМС.`
          : 'Проверьте доступность Telefon-IP и ключ API в настройках сервера.',
      data: { type: 'telefonip_balance', url: '/cabinet/phone-auth' },
      tag: 'telefonip-balance',
    }
    const results = await Promise.allSettled(
      tenants.map((tenantId) =>
        sendMultiChannelPushToTenant({
          tenantId,
          payload,
          source: 'telefonip-balance',
        })
      )
    )
    const notified = results.filter(
      (item) => item.status === 'fulfilled' && item.value?.sent > 0
    ).length
    if (!notified) {
      await SiteSettings.updateOne(
        { tenantId: null, 'telefonipBalance.lastAlertAt': now },
        { $unset: { 'telefonipBalance.lastAlertAt': '' } }
      )
    }
    return { status: result.status, notified }
  } catch {
    // Monitoring must never interrupt subscription renewals.
    return { status: 'error', notified: 0 }
  }
}
