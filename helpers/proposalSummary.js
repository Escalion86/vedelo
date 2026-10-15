export const getEventProposalsSummary = ({
  eventId,
  data,
  isPending,
  isError,
  isFetching,
}) => {
  if (!eventId) return 'Сначала сохраните заказ'
  if (data === undefined)
    return isError
      ? 'Не удалось загрузить предложения'
      : 'Загружаем предложения…'
  const drafts = data.filter((item) => item.status === 'draft').length
  const published = data.filter((item) => item.status === 'published').length
  const counts = [
    drafts ? `Черновиков: ${drafts}` : '',
    published ? `Опубликовано: ${published}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const text =
    counts ||
    (data.length ? 'Черновиков и опубликованных нет' : 'Предложений пока нет')
  if (isError) return `${text} · Не удалось обновить`
  if (isFetching || isPending) return `${text} · Обновляем…`
  return text
}
