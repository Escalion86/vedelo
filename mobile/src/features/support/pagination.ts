export const supportCursor = (meta: { hasMore: boolean; nextCursor: string | null }) => {
  if (typeof meta?.hasMore !== 'boolean' || (meta.hasMore && (typeof meta.nextCursor !== 'string' || !meta.nextCursor))) throw new Error('Не удалось обработать страницу поддержки')
  return meta.hasMore ? meta.nextCursor : null
}
