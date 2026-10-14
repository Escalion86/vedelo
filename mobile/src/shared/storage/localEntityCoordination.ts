// Only the local mutation/remap/clear boundaries own this queue. Cache/outbox
// helpers stay reentrant; neither network requests nor runSync belong here.
let writes: Promise<unknown> = Promise.resolve()
let epoch = 0

export const localDataEpoch = () => epoch
export const invalidateLocalDataEpoch = () => { epoch += 1 }
export const assertLocalDataEpoch = (expected: number) => {
  if (expected !== epoch) throw new Error('SESSION_CHANGED')
}

export const withLocalEntityWrite = <T>(work: () => Promise<T>): Promise<T> => {
  const result = writes.then(work)
  writes = result.catch(() => undefined)
  return result
}

export const withLocalDataClear = <T>(work: () => Promise<T>): Promise<T> => {
  // Invalidate captures immediately, including work already waiting in the queue.
  // A dispatched SQL write drains before clear; new writes queue after clear.
  invalidateLocalDataEpoch()
  return withLocalEntityWrite(work)
}
