import Tariffs from '@models/Tariffs'
import Users from '@models/Users'
import { addMonths } from './billingCalculations.js'
import personalTariffs from './personalTariffs.js'

const applyTariffPurchase = async ({ userId, tariffId, tenantId, skipCompensation = false }) => {
  const user = await Users.findOne({ _id: userId, ...(tenantId ? { tenantId } : {}) }).select('+pendingBillingReceipt').lean()
  if (!user) return { ok: false, error: 'Пользователь не найден' }
  const tariff = await Tariffs.findById(tariffId).lean()
  return personalTariffs.change({ user, tariff, skipCompensation })
}

export { addMonths, applyTariffPurchase }
