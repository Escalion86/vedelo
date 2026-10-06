import { File, Paths } from 'expo-file-system'

// Only delete a copy explicitly created by us. Picker/gallery sources are never removed.
export const copyImage = (uri: string, name: string) => {
  const copy = new File(Paths.cache, `vedelo-image-${Date.now()}-${Math.random().toString(36).slice(2)}-${name.replace(/[^\w.-]/g, '_')}`)
  try { new File(uri).copy(copy) }
  catch (reason) { try { if (copy.exists) copy.delete() } catch {} ; throw reason }
  return { uri: copy.uri, dispose: () => { try { if (copy.exists) copy.delete() } catch { /* Preserve the operation result. */ } } }
}
