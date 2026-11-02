type SharedDraft = { id: string; generation: string; text: string; mode: 'manual' | 'text' }
let draft: SharedDraft | null = null
export const setSharedDraft = (value: SharedDraft) => { draft = { ...value, text: value.text.slice(0, 20_000) } }
export const clearSharedDraft = () => { draft = null }
export const readSharedDraft = (id?: string, generation?: string) => id && generation && draft?.id === id && draft.generation === generation ? draft : null
export const consumeSharedDraft = (id?: string, generation?: string) => {
  if (!id || !generation || draft?.id !== id || draft.generation !== generation) return null
  const value = draft; draft = null; return value
}
