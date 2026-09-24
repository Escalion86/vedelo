export const getEventTransactionAction = ({
  clone = false,
  status = 'draft',
  sourceEventId = null,
  isFormChanged = false,
} = {}) => {
  if (clone) {
    return {
      type: 'blocked',
      error: 'В копии транзакции недоступны до сохранения',
    }
  }

  if (status === 'draft') {
    return { type: 'autosave', promoteDraft: true }
  }

  if (!sourceEventId || isFormChanged) {
    return { type: 'autosave' }
  }

  return {
    type: 'open',
    eventId: sourceEventId,
  }
}

export default getEventTransactionAction
