const IMMUTABLE_FIELDS = new Set([
  '_id',
  '__v',
  'tenantId',
  'createdAt',
  'updatedAt',
  'aiEditReceipts',
  'aiEditPaymentFingerprint',
])

const getTenantSafeUpdateFields = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(payload).filter(
      ([key]) =>
        !IMMUTABLE_FIELDS.has(key) &&
        !String(key).startsWith('$') &&
        !String(key).includes('.')
    )
  )
}

const buildTenantSafeUpdate = (payload) => ({
  $set: getTenantSafeUpdateFields(payload),
})

export { buildTenantSafeUpdate, getTenantSafeUpdateFields }
