export const safeHttps = (value: unknown): string => {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value)) return ''
  try { const url = new URL(value.trim()); return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? url.href : '' } catch { return '' }
}
export const paymentDate = (value: string | null) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString('ru-RU') : 'Дата не указана'
