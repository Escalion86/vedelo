import { LEARNING_IDS } from '../helpers/learningCatalog.mjs'

const ids = new Set(LEARNING_IDS)
const fail = (status, message) => Object.assign(new Error(message), { status })

export const learningScope = ({ tenantId, user } = {}) => {
  if (
    ![tenantId, user?._id].every((id) =>
      /^[a-f\d]{24}$/i.test(String(id || ''))
    )
  ) {
    throw fail(401, 'Не авторизован')
  }
  return { tenantId: String(tenantId), userId: String(user._id) }
}

export const parseLearningCommand = (body) => {
  const fields = {
    visit: ['action'],
    present: ['action'],
    dismiss: ['action', 'articleId'],
    read: ['action', 'articleId'],
    known: ['action', 'articleId'],
    preference: ['action', 'enabled'],
  }
  const allowed = body && !Array.isArray(body) && fields[body.action]
  if (
    !Array.isArray(allowed) ||
    Object.keys(body).some((key) => !allowed.includes(key))
  ) {
    throw fail(400, 'Некорректное действие')
  }
  if (allowed.includes('articleId') && !ids.has(body.articleId)) {
    throw fail(400, 'Материал не найден')
  }
  if (body.action === 'preference' && typeof body.enabled !== 'boolean') {
    throw fail(400, 'Укажите настройку показа советов')
  }
  return body
}

export const learningSnapshot = (row = {}) => ({
  enabled: row.enabled !== false,
  readIds: (row.readIds || []).filter((id) => ids.has(id)),
  knownIds: (row.knownIds || []).filter((id) => ids.has(id)),
  activeDays: row.activeDays || 0,
  lastActiveDay: row.lastActiveDay || '',
  lastTipDay: row.lastTipDay ?? -3,
  tipId: ids.has(row.tipId) ? row.tipId : null,
  tipDismissed: row.tipDismissed === true,
  revision: row.revision || 0,
})

export const transitionLearningProgress = (row, command, now = new Date()) => {
  const state = learningSnapshot(row)
  const { action, articleId } = parseLearningCommand(command)
  if (action === 'visit' || action === 'present') {
    const day = now.toISOString().slice(0, 10)
    if (day > state.lastActiveDay) {
      state.activeDays += 1
      state.lastActiveDay = day
    }
  }
  if (action === 'preference') state.enabled = command.enabled
  if (action === 'read')
    state.readIds = [...new Set([...state.readIds, articleId])]
  if (action === 'known')
    state.knownIds = [...new Set([...state.knownIds, articleId])]
  if (action === 'dismiss' && state.tipId === articleId)
    state.tipDismissed = true
  if (
    action === 'present' &&
    state.enabled &&
    state.activeDays - state.lastTipDay >= 3
  ) {
    const excluded = new Set([...state.readIds, ...state.knownIds])
    const start = (LEARNING_IDS.indexOf(state.tipId) + 1) % LEARNING_IDS.length
    const ordered = [
      ...LEARNING_IDS.slice(start),
      ...LEARNING_IDS.slice(0, start),
    ]
    state.tipId = ordered.find((id) => !excluded.has(id)) || null
    state.tipDismissed = false
    state.lastTipDay = state.activeDays
  }
  return state
}

// Compare-and-swap preserves changes from other tabs/devices without transactions.
export const updateLearningProgress = async (
  Model,
  context,
  command,
  now = new Date()
) => {
  const scope = learningScope(context)
  parseLearningCommand(command)
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await Model.findOne(scope).lean()
    const before = learningSnapshot(current || {})
    const next = transitionLearningProgress(before, command, now)
    if (current && JSON.stringify(before) === JSON.stringify(next))
      return before
    next.revision = before.revision + 1
    try {
      if (!current) {
        await Model.create({ ...scope, ...next })
        return next
      }
      const saved = await Model.findOneAndUpdate(
        { ...scope, revision: before.revision },
        { $set: next },
        { returnDocument: 'after', runValidators: true }
      ).lean()
      if (saved) return learningSnapshot(saved)
    } catch (error) {
      if (error?.code !== 11000) throw error
    }
  }
  throw fail(409, 'Настройки изменились в другой вкладке. Повторите действие.')
}
