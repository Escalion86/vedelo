// Synthetic auth boundary with real subscription lifecycle and identity notifications.
// No proposal API/identity/operations module is replaced by this fixture.
function createSessionBoundary(currentUser) {
  const listeners = new Set()
  let observed
  const notify = () => {
    const user = currentUser(), key = JSON.stringify(user && [user._id, user.tenantId || user._id])
    if (key === observed) return
    observed = key
    for (const listener of listeners) listener(user)
  }
  return {
    getStoredUser: async () => currentUser(),
    getAccessToken: async () => currentUser() ? 'synthetic-only' : null,
    subscribeAuthSession: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    notify,
  }
}
module.exports = { createSessionBoundary }
