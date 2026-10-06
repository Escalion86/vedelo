import { z } from 'zod'
const date = z.string().refine((value) => Number.isFinite(Date.parse(value))).nullable()
const count = z.number().int().nonnegative()
const amount = z.number().finite().nonnegative()
const row = z.object({ user: z.object({ _id: z.string().min(1), firstName: z.string(), secondName: z.string(), thirdName: z.string(), registrationType: z.string(), createdAt: date }), rewardsTotal: amount, rewardsCount: count, lastRewardAt: date })
const schema = z.object({ success: z.literal(true), data: z.object({ referrals: z.array(row), referralsCount: count, rewardsTotal: amount, rewardsCount: count }) })
export function readReferrals(response: unknown) {
  const parsed = schema.safeParse(response)
  if (!parsed.success || parsed.data.data.referralsCount !== parsed.data.data.referrals.length) throw new Error('INVALID_REFERRALS')
  const data = parsed.data.data
  const sum = data.referrals.reduce((result, entry) => ({ total: result.total + entry.rewardsTotal, count: result.count + entry.rewardsCount }), { total: 0, count: 0 })
  if (sum.count !== data.rewardsCount || Math.abs(sum.total - data.rewardsTotal) > 0.000001 || new Set(data.referrals.map((entry) => entry.user._id)).size !== data.referrals.length) throw new Error('INVALID_REFERRALS')
  return data
}
export function referralLink(apiBaseUrl: string, userId: string) {
  if (!/^[a-f\d]{24}$/i.test(userId)) return ''
  try {
    const url = new URL(apiBaseUrl)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return ''
    return `${url.origin}/login?mode=register&ref=${encodeURIComponent(userId)}`
  } catch { return '' }
}
export const referralName = (user: z.infer<typeof row>['user']) => [user.secondName, user.firstName, user.thirdName].filter(Boolean).join(' ').trim() || 'Пользователь'
