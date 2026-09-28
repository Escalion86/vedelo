import { getMaxContactAction } from './maxContact'

const phone = (value) => String(value || '').replace(/\D/g, '')
const handle = (value) => encodeURIComponent(String(value || '').trim().replace(/^@/, ''))

export const getProposalContactOptions = (client, message) => {
  if (!client) return []
  const options = []
  const text = encodeURIComponent(message)
  const number = phone(client.phone)
  const whatsapp = phone(client.whatsapp) || (!client.whatsappPhoneUnavailable && number)
  const telegramPhone = phone(client.telegramPhone) || (!client.telegramPhoneUnavailable && number)
  if (whatsapp) options.push({ id: 'whatsapp', label: 'WhatsApp', detail: `+${whatsapp}`, url: `https://wa.me/${whatsapp}?text=${text}` })
  if (client.telegram) options.push({ id: 'telegram', label: 'Telegram', detail: `@${String(client.telegram).replace(/^@/, '')}`, url: `tg://resolve?domain=${handle(client.telegram)}` })
  else if (telegramPhone) options.push({ id: 'telegram', label: 'Telegram', detail: `+${telegramPhone}`, url: `tg://resolve?phone=${telegramPhone}` })
  const max = getMaxContactAction(client.max || (!client.maxPhoneUnavailable && number))
  if (max) options.push({ id: 'max', label: 'MAX', detail: max.type === 'phone' ? `Найдите клиента по номеру ${max.phone}` : 'Открыть контакт', url: max.url })
  if (client.viber) options.push({ id: 'viber', label: 'Viber', detail: `+${phone(client.viber)}`, url: `viber://chat?number=${encodeURIComponent('+' + phone(client.viber))}` })
  if (client.vk) options.push({ id: 'vk', label: 'ВКонтакте', detail: String(client.vk), url: `https://vk.com/${handle(client.vk)}` })
  if (client.instagram) options.push({ id: 'instagram', label: 'Instagram', detail: String(client.instagram), url: `https://instagram.com/${handle(client.instagram)}` })
  if (number) options.push({ id: 'sms', label: 'SMS', detail: `+${number}`, url: `sms:+${number}?body=${text}` })
  if (client.email) options.push({ id: 'email', label: 'Электронная почта', detail: client.email, url: `mailto:${encodeURIComponent(client.email)}?body=${text}` })
  return options.sort((a, b) => Number(b.id === client.preferredContactChannel) - Number(a.id === client.preferredContactChannel))
}
