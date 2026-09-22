import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LEARNING_IDS,
  getLearningArticles,
} from '../helpers/learningCatalog.mjs'
import { resolveWorkItemTerminology } from '../helpers/workItemTerminology.mjs'
import {
  learningScope,
  parseLearningCommand,
  learningSnapshot,
  transitionLearningProgress as change,
  updateLearningProgress,
} from './learningProgress.mjs'

const date = (day) =>
  new Date(`2026-09-${String(day).padStart(2, '0')}T12:00:00Z`)
const present = (state, day) => change(state, { action: 'present' }, date(day))

test('one active day per UTC date; inactivity does not accelerate rotation', () => {
  let state = present({}, 1)
  assert.equal(state.tipId, LEARNING_IDS[0])
  assert.equal(state.activeDays, 1)
  state = present(state, 1)
  state = present(state, 15)
  state = present(state, 20)
  assert.equal(state.activeDays, 3)
  assert.equal(state.tipId, LEARNING_IDS[0])
  state = present(state, 21)
  assert.equal(state.tipId, LEARNING_IDS[1])
})

test('cabinet visits count but only presentation rotates a tip', () => {
  let state = present({}, 1)
  for (const day of [2, 3, 4])
    state = change(state, { action: 'visit' }, date(day))
  assert.equal(state.tipId, LEARNING_IDS[0])
  assert.equal(present(state, 4).tipId, LEARNING_IDS[1])
})

test('dismissal persists, stale dismissal cannot dismiss the next tip', () => {
  let state = present({}, 1)
  state = change(state, { action: 'dismiss', articleId: LEARNING_IDS[0] })
  assert.equal(present(state, 1).tipDismissed, true)
  for (const day of [2, 3, 4]) state = present(state, day)
  assert.equal(state.tipDismissed, false)
  assert.equal(
    change(state, { action: 'dismiss', articleId: LEARNING_IDS[0] })
      .tipDismissed,
    false
  )
})

test('known/read excluded; disabling does not erase progress; all studied hides tips', () => {
  let state = present({}, 1)
  state = change(state, { action: 'known', articleId: LEARNING_IDS[1] })
  state = change(state, { action: 'read', articleId: LEARNING_IDS[2] })
  state = change(state, { action: 'preference', enabled: false })
  for (const day of [2, 3, 4]) state = present(state, day)
  assert.equal(state.tipId, LEARNING_IDS[0])
  state = change(state, { action: 'preference', enabled: true })
  state = present(state, 4)
  assert.equal(state.tipId, LEARNING_IDS[3])
  for (const articleId of LEARNING_IDS)
    state = change(state, { action: 'read', articleId })
  for (const day of [5, 6, 7]) state = present(state, day)
  assert.equal(state.tipId, null)
  assert.equal(state.readIds.length, LEARNING_IDS.length)
})

test('rejects unauthenticated scope, owner injection, operators and invalid commands', () => {
  for (const context of [
    {},
    { tenantId: 'bad', user: { _id: 'a'.repeat(24) } },
  ]) {
    assert.throws(() => learningScope(context), { status: 401 })
  }
  for (const command of [
    null,
    [],
    {},
    { action: 'constructor' },
    { action: 'read', articleId: 'missing' },
    { action: 'preference', enabled: 'false' },
    { action: 'visit', tenantId: 'b'.repeat(24) },
    { action: 'visit', userId: 'b'.repeat(24) },
    { action: 'visit', $set: { enabled: false } },
  ]) {
    assert.throws(() => parseLearningCommand(command), { status: 400 })
  }
})

const context = (tenant = 'a', user = tenant) => ({
  tenantId: tenant.repeat(24),
  user: { _id: user.repeat(24) },
})
function memoryModel() {
  const rows = new Map()
  const key = (scope) => `${scope.tenantId}:${scope.userId}`
  return {
    rows,
    findOne: (scope) => ({
      lean: async () => structuredClone(rows.get(key(scope)) || null),
    }),
    create: async (row) => {
      if (rows.has(key(row)))
        throw Object.assign(new Error('duplicate'), { code: 11000 })
      rows.set(key(row), structuredClone(row))
    },
    findOneAndUpdate: (scope, update) => ({
      lean: async () => {
        assert.ok(
          scope.tenantId && scope.userId,
          'every update must constrain tenant and user'
        )
        const row = rows.get(key(scope))
        if (!row || row.revision !== scope.revision) return null
        const result = { ...row, ...update.$set }
        rows.set(key(scope), result)
        return structuredClone(result)
      },
    }),
  }
}

test('tenant-negative and same-tenant different-user isolation, no identity in DTO', async () => {
  const model = memoryModel()
  await updateLearningProgress(model, context(), {
    action: 'known',
    articleId: LEARNING_IDS[0],
  })
  for (const other of [context('b'), context('a', 'b')]) {
    const result = await updateLearningProgress(
      model,
      other,
      { action: 'visit' },
      date(1)
    )
    assert.deepEqual(result.knownIds, [])
    assert.equal(result.tenantId, undefined)
    assert.equal(result.userId, undefined)
  }
  const own = await model.findOne(learningScope(context())).lean()
  assert.deepEqual(learningSnapshot(own).knownIds, [LEARNING_IDS[0]])
})

test('concurrent creation/visits/marks retain both updates without duplicate active days', async () => {
  const model = memoryModel()
  await Promise.all([
    updateLearningProgress(model, context(), { action: 'present' }, date(1)),
    updateLearningProgress(model, context(), { action: 'visit' }, date(1)),
    updateLearningProgress(
      model,
      context(),
      { action: 'known', articleId: LEARNING_IDS[0] },
      date(1)
    ),
    updateLearningProgress(
      model,
      context(),
      { action: 'read', articleId: LEARNING_IDS[1] },
      date(1)
    ),
  ])
  const row = await model.findOne(learningScope(context())).lean()
  assert.equal(model.rows.size, 1)
  assert.equal(row.activeDays, 1)
  assert.deepEqual(row.readIds, [LEARNING_IDS[1]])
  assert.deepEqual(row.knownIds, [LEARNING_IDS[0]])
})

test('catalog uses stable IDs, internal cabinet links and both terminology modes', () => {
  for (const mode of ['events', 'orders']) {
    const articles = getLearningArticles(
      resolveWorkItemTerminology({ custom: { primaryEntityTerminology: mode } })
    )
    assert.deepEqual(
      articles.map((article) => article.id),
      LEARNING_IDS
    )
    assert.equal(new Set(articles.map((article) => article.id)).size, 10)
    for (const article of articles) {
      assert.match(article.href, /^\/cabinet\/[a-zA-Z-]+$/)
      assert.equal(article.steps.length, 3)
    }
    assert.match(
      articles[0].steps[0],
      mode === 'orders' ? /заказа/ : /мероприятия/
    )
  }
})
