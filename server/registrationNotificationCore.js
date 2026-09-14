const REGISTRATION_TYPE_LABELS = Object.freeze({
  phone: 'по телефону',
  vk: 'через VK ID',
})

export const buildNewUserRegistrationPush = (user = {}) => {
  const registrationType = String(user.registrationType || 'phone').trim()
  const registrationLabel =
    REGISTRATION_TYPE_LABELS[registrationType] || 'через приложение'
  const registrationSource = String(user.registrationSource || '').trim()
  const body = registrationSource
    ? `Регистрация ${registrationLabel}. Источник: ${registrationSource}`
    : `Регистрация ${registrationLabel}`

  return {
    title: 'Новый пользователь Ведело',
    body,
    tag: `new-user-${String(user._id || Date.now())}`,
    data: {
      type: 'new_user_registration',
      userId: String(user._id || ''),
      url: '/cabinet/users',
    },
  }
}
