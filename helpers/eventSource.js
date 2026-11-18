const isObject = (value) => value && typeof value === 'object'

const isEventCreatedViaPublicApi = (event) => {
  const clientData = event?.clientData
  if (!isObject(clientData)) return false

  if (clientData.createdViaApi === true) return true

  const leadData = clientData.lead
  if (!isObject(leadData)) return false
  if (leadData.isPublicApi === true) return true

  const hasRawPayload =
    leadData.raw !== null &&
    leadData.raw !== undefined &&
    typeof leadData.raw === 'object'
  if (!hasRawPayload) return false

  return (
    leadData.source !== undefined ||
    leadData.phone !== undefined ||
    leadData.telegram !== undefined ||
    leadData.whatsapp !== undefined ||
    leadData.comment !== undefined
  )
}

const getEventPublicApiSourceLabel = (event) => {
  if (!isEventCreatedViaPublicApi(event)) return ''

  const clientData = event?.clientData
  const leadData = isObject(clientData?.lead) ? clientData.lead : {}
  const label =
    clientData?.sourceLabel ||
    clientData?.apiKeyName ||
    leadData?.sourceLabel ||
    leadData?.apiKeyName ||
    clientData?.source ||
    leadData?.source

  return typeof label === 'string' && label.trim() ? label.trim() : 'API'
}

const getEventIncomingSourceLabel = (event) => {
  const lead = event?.clientData?.lead
  return lead?.source === 'telegram' && lead.conversationId
    ? 'Telegram'
    : getEventPublicApiSourceLabel(event)
}

export { getEventIncomingSourceLabel, getEventPublicApiSourceLabel, isEventCreatedViaPublicApi }
