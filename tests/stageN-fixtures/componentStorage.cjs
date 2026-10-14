// Synthetic component storage boundary, NOT the production queue/epoch/SQL proof.
// It acknowledges a write by rereading and rejects missing/pending/inactive state.
// The discoverable readback.stageN.test.ts covers the real production boundary.
async function publishStorageBoundary(kind, fresh, active, publish, read, write) {
  if (!active()) throw Error('SESSION_CHANGED')
  const saved = await read(kind, fresh._id)
  if (!saved || saved._id !== fresh._id || (saved.syncStatus && saved.syncStatus !== 'synced')) throw Error('EVENT_HAS_LOCAL_CHANGES')
  if (!active()) throw Error('SESSION_CHANGED')
  const merged = { ...saved, ...Object.fromEntries(Object.entries(fresh).filter(([, value]) => value !== undefined)) }
  await write(kind, [merged])
  const persisted = await read(kind, fresh._id)
  if (!active()) throw Error('SESSION_CHANGED')
  if (!persisted || JSON.stringify(persisted) !== JSON.stringify(merged)) throw Error('READBACK_NOT_COMMITTED')
  publish(persisted)
  return persisted
}
module.exports = { publishStorageBoundary }
