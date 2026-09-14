import crypto from 'node:crypto'
import dbConnect from '@server/dbConnect'
import DomainMigrationCodes from '@models/DomainMigrationCodes'
import Users from '@models/Users'
import { DOMAIN_MIGRATION_CODE_TTL_MS } from '@helpers/domainMigration.mjs'

const hashCode = (code) =>
  crypto.createHash('sha256').update(String(code || '')).digest('hex')

export const issueDomainMigrationCode = async ({ userId, tenantId, legacyPushEndpoint = '' }) => {
  if (!userId || !tenantId) return null
  await dbConnect()

  const code = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + DOMAIN_MIGRATION_CODE_TTL_MS)
  await DomainMigrationCodes.create({
    codeHash: hashCode(code),
    userId,
    tenantId,
    sourceOrigin: 'artistcrm',
    targetOrigin: 'vedelo',
    expiresAt,
    legacyPushEndpoint: String(legacyPushEndpoint || '').slice(0, 2000),
  })
  return { code, expiresAt }
}

export const consumeDomainMigrationCode = async (code) => {
  const normalized = String(code || '').trim()
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(normalized)) return null
  await dbConnect()

  const redeemed = await DomainMigrationCodes.findOneAndUpdate(
    {
      codeHash: hashCode(normalized),
      targetOrigin: 'vedelo',
      usedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { usedAt: new Date() } },
    { returnDocument: 'after' }
  ).lean()
  if (!redeemed) return null

  const user = await Users.findOne({
    _id: redeemed.userId,
    $or: [{ tenantId: redeemed.tenantId }, { _id: redeemed.tenantId }],
  }).lean()
  if (!user) return null

  return {
    id: String(user._id),
    phone: user.phone ?? '',
    role: user.role ?? 'user',
    tenantId: String(user.tenantId || user._id),
    firstName: user.firstName ?? '',
    secondName: user.secondName ?? '',
    tariffId: user.tariffId ? String(user.tariffId) : null,
    domainMigrationId: String(redeemed._id),
  }
}
