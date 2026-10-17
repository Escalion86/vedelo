export const sameTariffId = (a, b) => Boolean(a && b && String(a) === String(b))

// An assigned legacy hidden tariff remains renewable without a new grant.
export const canSelectTariff = (user, tariff) =>
  Boolean(
    tariff &&
    (!tariff.hidden ||
      sameTariffId(user?.tariffId, tariff._id) ||
      user?.allowedTariffIds?.some((id) => sameTariffId(id, tariff._id)))
  )

export const hasRemainingTariffPeriod = (user, now = new Date()) =>
  Boolean(
    user?.tariffId &&
    user?.tariffActiveUntil &&
    new Date(user.tariffActiveUntil) > now
  )

export const billingIdentity = (user) => ({
  _id: user._id,
  tenantId: user.tenantId ?? null,
})

// Compare the billing snapshot, so a concurrent renewal, grant revocation or
// another selection cannot overwrite the decision made from an older read.
export const billingSnapshot = (user) => ({
  ...billingIdentity(user),
  tariffId: user.tariffId ?? null,
  balance: user.balance ?? 0,
  tariffActiveUntil: user.tariffActiveUntil ?? null,
  nextChargeAt: user.nextChargeAt ?? null,
  pendingTariffChange: user.pendingTariffChange ?? null,
  billingRevision: user.billingRevision
    ? user.billingRevision
    : { $in: [null, 0] },
})
