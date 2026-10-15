import test from 'node:test'
import assert from 'node:assert/strict'
import { getEventProposalsSummary as summary } from '../helpers/proposalSummary.js'
const input = {
  eventId: 'event',
  isPending: false,
  isError: false,
  isFetching: false,
}
test('подпись КП различает отсутствие данных, загрузку, ошибку, пусто, draft/published/both и refetch', () => {
  const check = (patch, expected) =>
    assert.equal(summary({ ...input, ...patch }), expected)
  check({ data: undefined, isPending: true }, 'Загружаем предложения…')
  check({ data: undefined, isError: true }, 'Не удалось загрузить предложения')
  check({ data: [] }, 'Предложений пока нет')
  check({ data: [{ status: 'draft' }] }, 'Черновиков: 1')
  check({ data: [{ status: 'published' }] }, 'Опубликовано: 1')
  check(
    {
      data: [{ status: 'draft' }, { status: 'published' }, { status: 'draft' }],
    },
    'Черновиков: 2 · Опубликовано: 1'
  )
  check(
    { data: [{ status: 'draft' }], isFetching: true },
    'Черновиков: 1 · Обновляем…'
  )
  check(
    { data: [{ status: 'published' }], isError: true },
    'Опубликовано: 1 · Не удалось обновить'
  )
  check({ data: [{ status: 'revoked' }] }, 'Черновиков и опубликованных нет')
  check({ eventId: '' }, 'Сначала сохраните заказ')
})
