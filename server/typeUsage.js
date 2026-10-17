export const countTypeUsage = async (Model, tenantId, field, fallback = '') => {
  const rows = await Model.find({ tenantId }).select({ [field]: 1, _id: 0 }).lean()
  const counts = new Map()
  for (const row of rows) {
    const value = typeof row[field] === 'string' && row[field] ? row[field] : fallback
    counts.set(value, (counts.get(value) || 0) + 1)
  }
  return Object.fromEntries(counts)
}
