export const getEventCardTitle = (event, services = []) => {
  const eventType =
    typeof event?.eventType === 'string' ? event.eventType.trim() : ''
  const servicesIds = event?.servicesIds ?? []
  const serviceTitles = services
    .filter((service) => servicesIds.includes(service._id))
    .map((service) => service.title)
    .filter(Boolean)

  return `${eventType || 'Событие не указано'} • ${serviceTitles.join(', ') || 'Услуга не указана'}`
}
