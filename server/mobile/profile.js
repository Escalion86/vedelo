const normalizeText = (value, maxLength) =>
  String(value ?? '')
    .trim()
    .slice(0, maxLength)

const normalizePhone = (value) => {
  const digits = String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 15)
  return digits ? Number(digits) : null
}

const normalizeHandle = (value, maxLength = 160) =>
  normalizeText(value, maxLength)
    .replace(/^@/, '')
    .replace(
      /^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me|vk\.com|instagram\.com)\//i,
      ''
    )
    .replace(/^\/+|\/+$/g, '')

export const normalizeMobileProfilePatch = (body = {}) => {
  const update = {}
  const assignText = (field, maxLength = 100) => {
    if (body[field] !== undefined)
      update[field] = normalizeText(body[field], maxLength)
  }
  assignText('firstName', 302)
  assignText('secondName')
  assignText('thirdName')
  if (body.email !== undefined) {
    const email = normalizeText(body.email, 320).toLowerCase()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { update: {}, error: 'Укажите корректный email' }
    }
    update.email = email
  }
  if (body.whatsapp !== undefined)
    update.whatsapp = normalizePhone(body.whatsapp)
  if (body.viber !== undefined) update.viber = normalizePhone(body.viber)
  if (body.telegram !== undefined)
    update.telegram = normalizeHandle(body.telegram)
  if (body.vk !== undefined) update.vk = normalizeHandle(body.vk)
  if (body.instagram !== undefined)
    update.instagram = normalizeHandle(body.instagram)
  if (body.images !== undefined) {
    update.images = Array.isArray(body.images)
      ? body.images
          .map((item) => normalizeText(item, 1000))
          .filter(Boolean)
          .slice(0, 10)
      : []
  }
  return { update, error: '' }
}

export const serializeMobileProfile = (user, tariff = null) => {
  if (!user) return null
  const data = typeof user.toObject === 'function' ? user.toObject() : user
  const tenantId = data.tenantId || data._id
  const tariffId = tariff?._id || data.tariffId?._id || data.tariffId
  return {
    _id: String(data._id),
    tenantId: String(tenantId),
    firstName: data.firstName || '',
    secondName: data.secondName || '',
    thirdName: data.thirdName || '',
    phone: data.phone || '',
    email: data.email || '',
    whatsapp: data.whatsapp ? String(data.whatsapp) : '',
    viber: data.viber ? String(data.viber) : '',
    telegram: data.telegram || '',
    vk: data.vk || '',
    instagram: data.instagram || '',
    images: Array.isArray(data.images)
      ? data.images.filter((item) => typeof item === 'string').slice(0, 10)
      : [],
    role: data.role || 'user',
    tariffId: tariffId ? String(tariffId) : null,
    tariffTitle: typeof tariff?.title === 'string' ? tariff.title.trim() : '',
    registrationOffer: data.registrationOffer
      ? {
          tariffId: data.registrationOffer.tariffId
            ? String(data.registrationOffer.tariffId)
            : null,
          tariffTitle: data.registrationOffer.tariffTitle || '',
          startedAt: data.registrationOffer.startedAt || null,
          endsAt: data.registrationOffer.endsAt || null,
          welcomeMessage: data.registrationOffer.welcomeMessage || '',
          featureKeys: Array.isArray(data.registrationOffer.featureKeys)
            ? data.registrationOffer.featureKeys
            : [],
          featureLabels: Array.isArray(data.registrationOffer.featureLabels)
            ? data.registrationOffer.featureLabels
            : [],
        }
      : null,
    registrationType: data.registrationType || 'phone',
    consentTermsAccepted: Boolean(data.consentTermsAccepted),
    consentPrivacyPolicyAccepted: Boolean(data.consentPrivacyPolicyAccepted),
    consentPersonalDataAccepted: Boolean(data.consentPersonalDataAccepted),
  }
}
