export type EditorMessage =
  { key: string; type: 'ready' } | { key: string; type: 'change'; html: string }
export const readEditorMessage = (
  raw: string,
  key: string
): EditorMessage | null => {
  try {
    const value = JSON.parse(raw)
    if (value?.key !== key) return null
    if (value.type === 'ready') return { key, type: 'ready' }
    if (
      value.type === 'change' &&
      typeof value.html === 'string' &&
      value.html.length <= 30000
    )
      return { key, type: 'change', html: value.html }
  } catch {
    /* Untrusted WebView messages are data, never executable code. */
  }
  return null
}
export const allowLocalNavigation = (url: string) => url === 'about:blank'
export type EditorCommand =
  | { type: 'setContent'; html: string }
  | { type: 'setEditable'; editable: boolean }
  | {
      type: 'insertMedia'
      kind: 'image' | 'video'
      url: string
      title?: string
    }
export const editorCommand = (command: EditorCommand): string => {
  if (command.type === 'setContent') {
    if (typeof command.html !== 'string' || command.html.length > 30000)
      throw new Error('INVALID_CONTENT')
  } else if (command.type === 'setEditable') {
    if (typeof command.editable !== 'boolean')
      throw new Error('INVALID_EDITABLE')
  } else if (command.type === 'insertMedia') {
    const url = new URL(command.url)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !['image', 'video'].includes(command.kind)
    )
      throw new Error('INVALID_MEDIA')
  } else throw new Error('INVALID_COMMAND')
  const data = JSON.stringify(command)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
  return `window.vedeloEditor(${data});true;`
}
