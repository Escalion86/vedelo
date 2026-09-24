import HistoryFeed from '@components/HistoryFeed'

const ENTITY_TITLES = {
  client: 'История клиента',
  transaction: 'История транзакции',
}

const historyFunc = (entityType, entityId, workItemTerms) => ({
  title:
    entityType === 'event'
      ? `История изменений ${workItemTerms.genitive}`
      : ENTITY_TITLES[entityType] || 'История действий',
  Children: () => (
    <div className="max-h-[70dvh] w-full overflow-y-auto pr-1">
      <HistoryFeed filters={{ entityType, entityId, limit: 30 }} compact />
    </div>
  ),
  declineButtonName: 'Закрыть',
  showDecline: true,
})

export default historyFunc
