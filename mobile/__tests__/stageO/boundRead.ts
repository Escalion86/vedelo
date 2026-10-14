// Проверяем наблюдаемые аргументы, не преобразуя вызовы транспортного мока.
export function expectBoundRead(
  calls: unknown[][],
  capturedToken: string,
  lifecycleSignal: AbortSignal,
  invocation?: unknown[],
): AbortSignal {
  const start = invocation ? calls.indexOf(invocation) : 0
  expect(start).toBeGreaterThanOrEqual(0)
  if (invocation) {
    expect((invocation[1] as { signal: AbortSignal }).signal).toBe(lifecycleSignal)
  }
  // Все чтения в окне проверяются, включая неверный signal: фильтр по signal
  // здесь скрыл бы ошибочный или дополнительный запрос самой операции.
  const reads = calls.slice(start).filter(([path]) => path === '/mobile/v1/events/e')
  expect(calls.slice(0, start).filter(([path, options]) =>
    path === '/mobile/v1/events/e' && (options as { signal?: AbortSignal })?.signal === lifecycleSignal,
  )).toHaveLength(0)
  expect(reads).toHaveLength(1)
  expect(lifecycleSignal).toBeInstanceOf(AbortSignal)
  expect(lifecycleSignal.aborted).toBe(false)
  expect((reads[0][1] as { signal: AbortSignal }).signal).toBe(lifecycleSignal)
  expect(reads[0]).toEqual(['/mobile/v1/events/e', {
    headers: { Authorization: `Bearer ${capturedToken}` },
    skipAuth: true,
    skipRefresh: true,
    signal: lifecycleSignal,
  }])
  return lifecycleSignal
}
