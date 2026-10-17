export const normalizeEventTypeList = (items = []) => [...new Set(
  (Array.isArray(items) ? items : []).filter(x => typeof x === 'string').map(x => x.trim()).filter(Boolean)
)].sort((a, b) => a.localeCompare(b, 'ru'))

export function prepareEventTypeEdit(base, rows) {
  if (!Array.isArray(base) || !Array.isArray(rows) || base.length > 500 || rows.length > 500)
    throw new Error('Некорректный список типов событий')
  const original = normalizeEventTypeList(base)
  const names = new Set(), sources = new Set(), renames = []
  const next = rows.map(row => {
    const name = typeof row?.name === 'string' ? row.name.trim() : ''
    if (!name || name.length > 200 || /[\u0000-\u001f]/.test(name)) throw new Error('Укажите название типа (до 200 символов)')
    if (names.has(name.toLocaleLowerCase('ru'))) throw new Error('Названия типов не должны повторяться')
    names.add(name.toLocaleLowerCase('ru'))
    if (row.original !== null) {
      if (!original.includes(row.original) || sources.has(row.original)) throw new Error('Некорректный исходный тип')
      sources.add(row.original)
      if (row.original !== name) {
        if (original.includes(name)) throw new Error('Новое название уже использовалось в этом списке. Выберите другое')
        renames.push({ from: row.original, to: name })
      }
    } else if (original.includes(name)) throw new Error('Тип уже существует в исходном списке')
    return name
  })
  return { base: original, next: normalizeEventTypeList(next), renames: renames.sort((a, b) => a.from.localeCompare(b.from, 'ru')) }
}
