export const SUPPORT_UNAVAILABLE_MESSAGE =
  'Поддержка для аккаунта разработчика недоступна в пользовательском приложении. Для личного обращения используйте обычный пользовательский аккаунт.'

// The existing server treats dev as an operator and omits tenant scope.
// Never downgrade the session role to access these endpoints.
export const canUseUserSupport = (user: { role?: string } | null | undefined) =>
  Boolean(user?.role) && user?.role !== 'dev'
