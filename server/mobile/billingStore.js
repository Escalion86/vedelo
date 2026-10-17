import { canSelectTariff } from '../../helpers/personalTariffs.mjs'
import Tariffs from '@models/Tariffs'
import Users from '@models/Users'
import { serializeMobileBilling } from './billing.js'

export const getMobileBillingUserFilter = ({ userId, tenantId }) => ({
  _id: userId,
  $or: [
    { tenantId },
    { tenantId: null, _id: tenantId },
  ],
})

export const loadMobileBilling = async ({ userId, tenantId }) => {
  const user = await Users.findOne(
    getMobileBillingUserFilter({ userId, tenantId })
  )
  if (!user) return null
  const [currentTariff, tariffs] = await Promise.all([
    user.tariffId ? Tariffs.findById(user.tariffId).lean() : null,
    Tariffs.find({}).sort({ price: 1, title: 1 }).lean(),
  ])
  return serializeMobileBilling({ user, currentTariff, tariffs: tariffs.filter((tariff) => canSelectTariff(user, tariff)) })
}
