// Клиентский редактор не может вернуть значение через URL: при создании клиента
// из редактора работы он передаёт локальный идентификатор одноразово, при возврате.
let pendingClientId: string | null = null

export const setPendingEventClient = (clientId: string) => {
  pendingClientId = clientId || null
}

export const consumePendingEventClient = () => {
  const clientId = pendingClientId
  pendingClientId = null
  return clientId
}

export const resetPendingEventClient = () => {
  pendingClientId = null
}
