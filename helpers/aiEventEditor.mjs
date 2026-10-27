const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)

export function aiEventEditorOptions(plan, event) {
  if (!plan?.planId || String(plan.eventId) !== String(event?._id))
    throw new Error('Не удалось открыть запись для проверки изменений')
  return {
    initialEvent: { ...event, ...(plan.eventPatch || {}) },
    aiFilledFields: [
      ...Object.keys(plan.eventPatch || {}),
      ...(plan.clientPatch ? ['clientId'] : []),
    ],
    aiPlan: plan,
  }
}

// Only manual corrections relative to the AI preview. Never send the stale full
// event after applying a resumable plan (which can also change tasks/payments).
export function manualAiEventChanges(baseline, current) {
  return Object.fromEntries(Object.entries(current).filter(([key, value]) =>
    key !== '_id' && !same(value, baseline[key])))
}

export async function saveAiEventReview({ plan, state, baseline, current, setEvent, request, refresh }) {
  state.manualChanges ??= manualAiEventChanges(baseline, current)
  try {
    const applied = await request('/api/events/ai-edit', {
      method: 'POST', body: JSON.stringify({ mode: 'apply', planId: plan.planId }),
    })
    if (applied.conflict || !applied.done)
      throw new Error(applied.error || 'Не все изменения сохранены. Проверьте данные и повторите сохранение.')
    if (Object.keys(state.manualChanges).length) {
      const saved = await setEvent({ ...state.manualChanges, _id: plan.eventId }, false)
      if (!saved?._id) throw new Error('Не удалось подтвердить сохранение ручных правок. Повторите сохранение для сверки.')
      return saved
    }
    const result = await request(`/api/events/${plan.eventId}`, { cache: 'no-store' })
    if (!result.data?._id) throw new Error('Не удалось перечитать сохранённую запись. Повторите сохранение для сверки.')
    return result.data
  } finally {
    await refresh()
  }
}
