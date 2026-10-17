export const sendSupportMessage = async (url, formData) => {
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
    headers: { Accept: 'application/json' },
  })
  const json = await response.json().catch(() => null)
  const errorMessage =
    typeof json?.error?.message === 'string'
      ? json.error.message
      : typeof json?.error === 'string'
        ? json.error
        : ''
  if (!response.ok) {
    throw new Error(errorMessage || `HTTP ${response.status}`)
  }
  if (
    json?.success !== true ||
    !json?.data?.ticket?.id ||
    !json?.data?.message?.id
  ) {
    throw new Error(
      errorMessage || 'Сервер не подтвердил сохранение сообщения. Текст оставлен в поле ввода.'
    )
  }
  return json
}
