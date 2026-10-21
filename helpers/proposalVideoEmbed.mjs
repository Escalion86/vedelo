// Генерируем адрес проигрывателя из ID, никогда не вставляем произвольный iframe URL.
export function getProposalVideoEmbed(value) {
  let url
  try { url = new URL(value) } catch { return null }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null
  const host = url.hostname.toLowerCase()
  const path = url.pathname.replace(/\/+$/, '')
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be', 'www.youtube-nocookie.com'].includes(host)) {
    const id = host.endsWith('youtu.be') ? path.slice(1)
      : path === '/watch' ? url.searchParams.get('v')
        : path.match(/^\/(?:embed|shorts|live)\/([\w-]+)$/)?.[1]
    if (!/^[\w-]{11}$/.test(id || '')) return null
    return { provider: 'YouTube', src: `https://www.youtube.com/embed/${id}` }
  }
  if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(host)) {
    const match = path.match(/^\/(?:video\/)?(\d+)(?:\/([a-zA-Z0-9]+))?$/)
      || path.match(/^\/(?:channels\/[^/]+|groups\/[^/]+\/videos)\/(\d+)$/)
    if (!match) return null
    const embed = new URL(`https://player.vimeo.com/video/${match[1]}`)
    const hash = url.searchParams.get('h') || match[2]
    if (hash && /^[a-zA-Z0-9]+$/.test(hash)) embed.searchParams.set('h', hash)
    return { provider: 'Vimeo', src: embed.toString() }
  }
  if (['rutube.ru', 'www.rutube.ru'].includes(host)) {
    const id = path.match(/^\/(?:video|shorts|play\/embed)\/([a-fA-F0-9]{32})$/)?.[1]
    if (!id) return null
    const embed = new URL(`https://rutube.ru/play/embed/${id}/`)
    const access = url.searchParams.get('p')
    if (access && /^[\w-]+$/.test(access)) embed.searchParams.set('p', access)
    return { provider: 'Rutube', src: embed.toString() }
  }
  if (['vk.com', 'www.vk.com', 'm.vk.com', 'vkvideo.ru', 'www.vkvideo.ru', 'm.vkvideo.ru'].includes(host)) {
    const match = path.match(/^\/video(-?\d+)_(\d+)$/)
      || url.searchParams.get('z')?.match(/^video(-?\d+)_(\d+)(?:\/|$)/)
    const owner = path === '/video_ext.php' ? url.searchParams.get('oid') : match?.[1]
    const id = path === '/video_ext.php' ? url.searchParams.get('id') : match?.[2]
    if (!/^-?\d+$/.test(owner || '') || !/^\d+$/.test(id || '')) return null
    const embed = new URL('https://vk.com/video_ext.php')
    embed.searchParams.set('oid', owner)
    embed.searchParams.set('id', id)
    const hash = url.searchParams.get('hash')
    if (hash && /^[a-zA-Z0-9]+$/.test(hash)) embed.searchParams.set('hash', hash)
    return { provider: 'VK Видео', src: embed.toString() }
  }
  return null
}
