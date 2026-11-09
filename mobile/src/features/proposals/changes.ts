const listeners = new Set<() => void>()

export function subscribeProposalChanges(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function notifyProposalChanges() {
  for (const listener of listeners) listener()
}
