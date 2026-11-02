// Shared by the PWA and the generated native proposal editor contract.
export const normalizeProposalMedia = (items) => {
  if (!Array.isArray(items)) return []
  const clean = (value, limit) =>
    String(value ?? '')
      .trim()
      .slice(0, limit)
  return items.slice(0, 10).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const kind = ['image', 'video', 'video_link'].includes(item.kind)
      ? item.kind
      : ''
    let url
    try {
      const parsed = new URL(clean(item.url, 2000))
      if (!['http:', 'https:'].includes(parsed.protocol)) return []
      if (
        kind === 'video_link' &&
        ![
          'youtube.com',
          'youtube-nocookie.com',
          'youtu.be',
          'rutube.ru',
          'vk.com',
          'vkvideo.ru',
          'vimeo.com',
        ].some(
          (domain) =>
            parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
        )
      )
        return []
      url = parsed.toString()
    } catch {
      return []
    }
    if (!kind) return []
    return [
      {
        id:
          clean(item.id, 100) ||
          `media-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
        kind,
        url,
        title: clean(item.title, 200),
        fileName: clean(item.fileName, 300),
        contentType: clean(item.contentType, 100),
        size: Math.max(0, Number(item.size) || 0),
      },
    ]
  })
}
