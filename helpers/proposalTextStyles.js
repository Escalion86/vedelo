// Единый узкий контракт CSS для сервера, клиентского санитайзера и TipTap.
export const PROPOSAL_FONT_FAMILIES = Object.freeze([
  'Arial',
  'Georgia',
  'Verdana',
  'Tahoma',
  'Times New Roman',
])
export const PROPOSAL_FONT_SIZES = Object.freeze([
  12, 14, 16, 18, 20, 24, 28, 32, 40, 48,
])
export const PROPOSAL_TEXT_ALIGNMENTS = Object.freeze([
  'left',
  'center',
  'right',
  'justify',
])

export const normalizeProposalTextStyle = (property, value) => {
  const input = String(value || '').trim()
  if (property === 'font-family') {
    const family = input.replace(/^(['"])(.*?)\1$/, '$2')
    return (
      PROPOSAL_FONT_FAMILIES.find(
        (item) => item.toLowerCase() === family.toLowerCase()
      ) || ''
    )
  }
  if (property === 'font-size') {
    const match = /^(\d+)px$/i.exec(input)
    return match && PROPOSAL_FONT_SIZES.includes(Number(match[1]))
      ? `${Number(match[1])}px`
      : ''
  }
  if (property === 'color') {
    if (/^#[a-f\d]{3}(?:[a-f\d]{3})?$/i.test(input)) return input.toLowerCase()
    const match =
      /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(input)
    if (match && match.slice(1).every((channel) => Number(channel) <= 255))
      return `#${match
        .slice(1)
        .map((channel) => Number(channel).toString(16).padStart(2, '0'))
        .join('')}`
  }
  if (property === 'text-align' && PROPOSAL_TEXT_ALIGNMENTS.includes(input))
    return input
  return ''
}

export const sanitizeProposalTextStyle = (style) =>
  String(style || '')
    .split(';')
    .flatMap((declaration) => {
      const colon = declaration.indexOf(':')
      if (colon < 0) return []
      const property = declaration.slice(0, colon).trim().toLowerCase()
      const value = normalizeProposalTextStyle(
        property,
        declaration.slice(colon + 1)
      )
      return value ? [`${property}: ${value}`] : []
    })
    .join('; ')
