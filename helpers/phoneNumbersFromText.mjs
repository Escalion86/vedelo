// PhoneInput stores Russian numbers as 7XXXXXXXXXX. Keep this parser local to
// phone fields: the AI assistant has a separate, stricter clipboard contract.
const separators = '[ \\t\\u00a0\\u202f.\\-‐‑‒–—]*'
const nationalNumber = [
  `(?:\\([3489]\\d{2}\\)|[3489]\\d{2})${separators}\\d{3}${separators}\\d{2}${separators}\\d{2}`,
  `\\([3489]\\d{3}\\)${separators}\\d{2}${separators}\\d{2}${separators}\\d{2}`,
  `\\([3489]\\d{4}\\)${separators}\\d${separators}\\d{2}${separators}\\d{2}`,
].join('|')
const phonePattern = new RegExp(
  `(?<![\\p{L}\\p{N}_+])(?:(?:\\+7|[78])${separators})?` +
    `(?:${nationalNumber})(?![\\p{L}\\p{N}_])`,
  'gu'
)
const foreignPrefix = new RegExp(`\\+\\d{1,3}${separators}$`)

export function phoneNumbersFromText(text) {
  if (typeof text !== 'string') return []
  const phones = new Set()
  for (const match of text.matchAll(phonePattern)) {
    // Do not treat the national part of +1/+44/+8 as a Russian phone.
    if (foreignPrefix.test(text.slice(Math.max(0, match.index - 12), match.index)))
      continue
    const digits = match[0].replace(/\D/g, '')
    const local = digits.length === 11 ? digits.slice(1) : digits
    if (/^(\d)\1{9}$/.test(local)) continue
    phones.add(`7${local}`)
  }
  return [...phones]
}

export const formatClipboardPhone = (phone) =>
  `+7 (${phone.slice(1, 4)}) ${phone.slice(4, 7)}-${phone.slice(7, 9)}-${phone.slice(9, 11)}`
