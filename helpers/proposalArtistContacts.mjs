import { getMaxContactAction } from './maxContact.js'

export const PROPOSAL_CONTACT_FIELDS = ['phone', 'telegram', 'vk', 'instagram', 'whatsapp', 'viber', 'max']

export const pickProposalArtistContacts = (profile = {}) => Object.fromEntries(
  PROPOSAL_CONTACT_FIELDS.map(key => [key,
    ['string', 'number'].includes(typeof profile?.[key]) ? String(profile[key]).trim().slice(0, 512) : '',
  ])
)

export function proposalPhoneNumber(value) {
  const raw = String(value ?? '').trim()
  if (!/^[+\d\s()–-]+$/.test(raw)) return ''
  let digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && digits[0] === '8') digits = `7${digits.slice(1)}`
  return digits.length >= 7 && digits.length <= 15 ? digits : ''
}

function socialUrl(value, domains, destination) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  let handle = raw.replace(/^@/, '')
  if (/^(?:https?:\/\/|www\.)/i.test(raw) || domains.some(domain => raw.startsWith(`${domain}/`))) {
    try {
      const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
      if (!domains.includes(url.hostname.replace(/^(?:www|m)\./, '')) || url.username || url.password || url.port) return ''
      handle = url.pathname.replace(/^\//, '').replace(/\/$/, '')
    } catch { return '' }
  }
  return /^[\w.]+$/.test(handle) ? `https://${destination}/${handle}` : ''
}

export function getProposalArtistContactLinks(profile = {}) {
  const items = [
    { id: 'vk', label: 'ВКонтакте', url: socialUrl(profile.vk, ['vk.com', 'vk.ru', 'vkontakte.ru'], 'vk.com') },
    { id: 'telegram', label: 'Telegram', url: socialUrl(profile.telegram, ['t.me', 'telegram.me'], 't.me') },
    { id: 'instagram', label: 'Instagram', url: socialUrl(profile.instagram, ['instagram.com'], 'instagram.com') },
  ]
  const whatsapp = proposalPhoneNumber(profile.whatsapp)
  const viber = proposalPhoneNumber(profile.viber)
  if (whatsapp) items.push({ id: 'whatsapp', label: 'WhatsApp', url: `https://wa.me/${whatsapp}` })
  if (viber) items.push({ id: 'viber', label: 'Viber', url: `viber://chat?number=${encodeURIComponent(`+${viber}`)}` })
  const max = getMaxContactAction(profile.max)
  if (max && (max.type === 'phone' || (!new URL(max.url).username && !new URL(max.url).password))) {
    items.push({ id: 'max', label: max.type === 'phone' ? `MAX: найдите по номеру ${max.phone}` : 'MAX', url: max.url, phone: max.phone })
  }
  return items.filter(item => item.url)
}
