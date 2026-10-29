import Services from '@models/Services'
import formatAddress from '@helpers/formatAddress'
import { resolveWorkItemTerminology } from '@helpers/workItemTerminology.mjs'
import { normalizeCalendarSettings } from '@server/googleUserCalendarClient'
import { getCanonicalBaseUrl } from '@helpers/brand.mjs'
import Clients from '@models/Clients'
import Transactions from '@models/Transactions'
import dbConnect from '@server/dbConnect'
import { TRANSACTION_CATEGORIES } from '@helpers/constants'
import { normalizeTransactionCategory } from '@helpers/transactionCategory.mjs'

const linkAReformer = (link) => {
  const textLink = link.substring(link.indexOf('>') + 1, link.lastIndexOf('<'))
  const text = link.substring(link.indexOf(`href="`) + 6).split('"')[0]
  return text === textLink || textLink === 'about:blank' || !textLink
    ? text
    : `${textLink} (${text})`
}

const normalizePhoneDigits = (value) => {
  if (value === null || value === undefined) return ''
  const digits = String(value).replace(/[^\d]/g, '')
  if (!digits) return ''
  if (digits.length >= 11 && (digits.startsWith('7') || digits.startsWith('8')))
    return `7${digits.slice(1, 11)}`
  if (digits.length === 10) return `7${digits}`
  return digits
}

const normalizeSocialHandle = (value) => {
  if (!value) return ''
  const trimmed = String(value).trim()
  if (!trimmed) return ''
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed
}

const buildClientContactsLines = (client) => {
  if (!client || typeof client !== 'object') return []
  const lines = []
  const phoneDigits = normalizePhoneDigits(client.phone)
  const whatsappDigits = normalizePhoneDigits(client.whatsapp)
  const viberDigits = normalizePhoneDigits(client.viber)
  const telegram = normalizeSocialHandle(client.telegram)
  const instagram = normalizeSocialHandle(client.instagram)
  const vk = normalizeSocialHandle(client.vk)
  const email = client.email ? String(client.email).trim() : ''

  if (phoneDigits) lines.push(`Телефон: +${phoneDigits}`)
  if (whatsappDigits) lines.push(`WhatsApp: wa.me/${whatsappDigits}`)
  if (viberDigits) lines.push(`Viber: viber://chat?number=+${viberDigits}`)
  if (telegram) lines.push(`Telegram: t.me/${telegram}`)
  if (instagram) lines.push(`Instagram: instagram.com/${instagram}`)
  if (vk) lines.push(`VK: vk.com/${vk}`)
  if (email) lines.push(`Email: ${email}`)

  return lines
}

const buildNavigationLinks = (address) => {
  if (!address || typeof address !== 'object') return []
  const links = []
  const town = typeof address.town === 'string' ? address.town.trim() : ''
  const street = typeof address.street === 'string' ? address.street.trim() : ''
  const house = typeof address.house === 'string' ? address.house.trim() : ''
  const searchAddress = [town, street, house].filter(Boolean).join(', ')

  const twoGisLink =
    address.link2Gis ||
    (town && street && house
      ? `https://2gis.ru/search/${encodeURIComponent(searchAddress).replaceAll(
          '%20',
          ''
        )}`
      : '')
  const yandexLink =
    address.linkYandexNavigator ||
    (town && street && house
      ? `yandexnavi://map_search?text=${encodeURIComponent(searchAddress)}`
      : '')

  if (twoGisLink) links.push(`2ГИС: ${twoGisLink}`)
  if (yandexLink) links.push(`Яндекс Навигатор: ${yandexLink}`)

  return links
}

export const isValidDateValue = (value) =>
  value instanceof Date && !Number.isNaN(value.getTime())

export const sanitizeToPlainText = (value) =>
  String(value ?? '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?[^>]+>/g, '')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .trim()

const formatAdditionalEventsForMainDescription = (additionalEvents = []) => {
  if (!Array.isArray(additionalEvents) || additionalEvents.length === 0)
    return ''

  const lines = additionalEvents
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const title = typeof item.title === 'string' ? item.title.trim() : ''
      const description =
        typeof item.description === 'string' ? item.description.trim() : ''
      const rawDate = item.date ? new Date(item.date) : null
      const dateLabel = isValidDateValue(rawDate)
        ? rawDate.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'без даты'
      const statusPrefix = item.done ? '[выполнено]' : '[в работе]'
      const parts = [title || 'Задача']
      if (description) parts.push(description)
      return `- ${statusPrefix} ${dateLabel}: ${parts.join(' — ')}`
    })
    .filter(Boolean)

  if (lines.length === 0) return ''
  return `Задачи/События:\n${lines.join('\n')}`
}

export const buildGoogleEventDescription = async (event, syncSettings) => {
  if (!event?.tenantId) throw new Error('tenant_required')
  const CALENDAR_RESPONSE_MARKER = '--- Google Calendar Response ---'
  const stripCalendarResponse = (text = '') => {
    const markerIndex = text.indexOf(`\n\n${CALENDAR_RESPONSE_MARKER}\n`)
    if (markerIndex === -1) return text.trim()
    return text.slice(0, markerIndex).trim()
  }

  let preparedText = syncSettings.showDescription
    ? stripCalendarResponse(event.description ?? '')
    : ''
  const extraDescriptionLines = []
  let clientName = ''
  let clientContactLines = []
  let colleagueName = ''
  let colleagueContactLines = []
  if (event?.clientId) {
    await dbConnect()
    const client = await Clients.findOne({ _id: event.clientId, tenantId: event.tenantId })
      .select(
        'firstName secondName phone whatsapp viber telegram instagram vk email'
      )
      .lean()
    clientName = [client?.firstName, client?.secondName]
      .filter(Boolean)
      .join(' ')
    if (syncSettings.showClient && clientName) {
      extraDescriptionLines.push(`Клиент: ${clientName}`)
    }
    clientContactLines = buildClientContactsLines(client)
    if (syncSettings.showClient && clientContactLines.length) {
      extraDescriptionLines.push(clientContactLines.join('\n'))
    }
  }
  if (
    syncSettings.showColleague &&
    event?.isTransferred &&
    event?.colleagueId
  ) {
    await dbConnect()
    const colleague = await Clients.findOne({ _id: event.colleagueId, tenantId: event.tenantId })
      .select(
        'firstName secondName phone whatsapp viber telegram instagram vk email'
      )
      .lean()
    colleagueName = [colleague?.firstName, colleague?.secondName]
      .filter(Boolean)
      .join(' ')
    colleagueContactLines = buildClientContactsLines(colleague)
    if (colleagueName || colleagueContactLines.length) {
      extraDescriptionLines.push(
        `Передано: ${colleagueName || 'Контакт не указан'}`
      )
      if (colleagueContactLines.length) {
        extraDescriptionLines.push(colleagueContactLines.join('\n'))
      }
    }
  }
  if (
    syncSettings.showOtherContacts &&
    Array.isArray(event?.otherContacts) &&
    event.otherContacts.length
  ) {
    await dbConnect()
    const contactIds = event.otherContacts
      .map((item) => item?.clientId)
      .filter(Boolean)
    const contacts =
      contactIds.length > 0
        ? await Clients.find({ _id: { $in: contactIds }, tenantId: event.tenantId })
            .select(
              'firstName secondName phone whatsapp viber telegram instagram vk email'
            )
            .lean()
        : []
    const contactsMap = new Map(
      contacts.map((item) => [String(item._id), item])
    )
    const otherContactsText = event.otherContacts
      .map((item) => {
        const contact = contactsMap.get(String(item.clientId))
        const contactName = [contact?.firstName, contact?.secondName]
          .filter(Boolean)
          .join(' ')
        const base = contactName || item?.clientId || 'Контакт'
        const suffix = item?.comment ? ` — ${item.comment}` : ''
        const contactLines = buildClientContactsLines(contact)
        if (contactLines.length > 0) {
          return `${base}${suffix}\n${contactLines
            .map((line) => `• ${line}`)
            .join('\n')}`
        }
        return `${base}${suffix}`
      })
      .filter(Boolean)
      .join('\n')
    if (otherContactsText)
      extraDescriptionLines.push(`Прочие контакты:\n${otherContactsText}`)
  }
  if (extraDescriptionLines.length) {
    preparedText = [preparedText, extraDescriptionLines.join('\n')]
      .filter(Boolean)
      .join('\n\n')
  }

  const financeLines = []
  const transactionCategoryMap = new Map(
    TRANSACTION_CATEGORIES.map((item) => [item.value, item.name])
  )
  if (
    syncSettings.showContractSum &&
    typeof event?.contractSum === 'number' &&
    event.contractSum > 0
  ) {
    financeLines.push(`Договорная сумма: ${event.contractSum.toLocaleString()}`)
  }
  if (syncSettings.showFinanceComment && event?.financeComment) {
    financeLines.push(`Комментарий по финансам: ${event.financeComment}`)
  }
  if (syncSettings.showTransactions && event?._id) {
    await dbConnect()
    const transactions = await Transactions.find({ eventId: event._id, tenantId: event.tenantId })
      .select('amount type category date comment')
      .sort({ date: -1 })
      .lean()
    if (transactions.length > 0) {
      const items = transactions.map((transaction) => {
        const dateLabel = transaction.date
          ? new Date(transaction.date).toLocaleDateString('ru-RU')
          : 'без даты'
        const sign = transaction.type === 'expense' ? '-' : '+'
        const amountLabel = Number(transaction.amount ?? 0).toLocaleString()
        const categoryName = transaction.category
          ? (transactionCategoryMap.get(normalizeTransactionCategory(transaction.category)) ??
            transaction.category)
          : ''
        const categoryLabel = categoryName ? `, ${categoryName}` : ''
        const commentLabel = transaction.comment
          ? ` — ${transaction.comment}`
          : ''
        return `- ${dateLabel}: ${sign}${amountLabel}${categoryLabel}${commentLabel}`
      })
      financeLines.push('Транзакции:')
      financeLines.push(...items)
    }
  }
  if (financeLines.length) {
    preparedText = [preparedText, financeLines.join('\n')]
      .filter(Boolean)
      .join('\n\n')
  }

  const additionalEventsDescription = formatAdditionalEventsForMainDescription(
    event?.additionalEvents
  )
  if (syncSettings.showAdditionalEvents && additionalEventsDescription) {
    preparedText = [preparedText, additionalEventsDescription]
      .filter(Boolean)
      .join('\n\n')
  }

  const navigationLinks = buildNavigationLinks(event?.address)
  if (syncSettings.showNavigationLinks && navigationLinks.length > 0) {
    preparedText = [preparedText, `Навигатор:\n${navigationLinks.join('\n')}`]
      .filter(Boolean)
      .join('\n\n')
  }
  const aTags = String(event.description ?? '').match(/<a[^>]*>([^<]+)<\/a>/g)
  // const linksReformated = []
  if (aTags?.length > 0) {
    for (let i = 0; i < aTags.length; i++)
      preparedText = preparedText.replaceAll(aTags[i], linkAReformer(aTags[i]))
  }

  return { preparedText, clientName, clientContactLines, colleagueName, colleagueContactLines }
}

export const buildGoogleTaskContext = async (event, user, settings) => {
  const syncSettings = normalizeCalendarSettings(user).syncSettings
  const { preparedText, clientName } = await buildGoogleEventDescription(event, syncSettings)
  const terms = resolveWorkItemTerminology(settings)
  const services = event.servicesIds?.length ? await Services.find({
    _id: { $in: event.servicesIds }, tenantId: event.tenantId,
  }).select('title').lean() : []
  const servicesTitle = services.map((service) => service.title).filter(Boolean).join(', ')
  const modes = {
    eventType_services: [event.eventType, servicesTitle],
    services_eventType: [servicesTitle, event.eventType],
    eventType: [event.eventType], services: [servicesTitle],
    eventTitle: [event.title], client_eventType: [clientName, event.eventType],
  }
  const title = (modes[syncSettings.titleMode] || []).filter(Boolean).join(' • ') ||
    [event.eventType, servicesTitle, event.title, clientName].filter(Boolean).join(' • ') || terms.labelCapitalized
  const date = event.eventDate ? new Date(event.eventDate) : null
  const address = formatAddress(event.address, event.location)
  return {
    heading: `Задача по ${terms.dative}`,
    description: sanitizeToPlainText([
      `${terms.labelCapitalized}: ${title}`,
      isValidDateValue(date) ? `Дата ${terms.genitive}: ${date.toLocaleString('ru-RU', { timeZone: settings?.timeZone || 'Asia/Krasnoyarsk' })}` : '',
      address ? `Место: ${address}` : '',
      preparedText.replace(/<\/p>|<br\s*\/?>|<\/li>/gi, '\n'),
    ].filter(Boolean).join('\n\n')),
    link: syncSettings.showEventLink
      ? `${getCanonicalBaseUrl()}/cabinet/eventsUpcoming?openEvent=${event._id}` : '',
  }
}

export const buildGoogleTaskNotes = (item, context, marker) => {
  // Reserve the footer before truncation: recovery must always retain the marker.
  const footer = `\n\n${context.link ? context.link + '\n' : ''}[vedelo:${marker}]`
  const text = [context.heading, item.description ? `Описание задачи:\n${sanitizeToPlainText(item.description)}` : '',
    context.description].filter(Boolean).join('\n\n')
  return text.slice(0, 8192 - footer.length) + footer
}
