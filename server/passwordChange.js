import bcrypt from 'bcryptjs'
import Users from '@models/Users'

// Минимальная и максимальная длина нового пароля. Верхняя граница отсекает
// злоупотребление длинным вводом до bcrypt; ниже 8 символов пароль не принимается.
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 200

// Единые сообщения: web и mobile отдают пользователю один и тот же текст.
export const PASSWORD_ERROR_MESSAGES = {
  INVALID_NEW_PASSWORD: `Новый пароль должен быть не менее ${PASSWORD_MIN_LENGTH} символов`,
  NEW_PASSWORD_TOO_LONG: 'Новый пароль слишком длинный',
  CURRENT_PASSWORD_REQUIRED: 'Введите текущий пароль',
  CURRENT_PASSWORD_INVALID: 'Текущий пароль указан неверно',
  USER_NOT_FOUND: 'Пользователь не найден',
  PASSWORD_ALREADY_SET: 'Пароль уже установлен. Обновите форму и повторите',
  PASSWORD_CHANGED: 'Пароль уже был изменён. Повторите попытку',
}

const isPasswordHash = (value) =>
  typeof value === 'string' && value.startsWith('$2')

// Пользователь всегда ищется по паре _id + tenantId, без archive.
// tenantId и userId приходят только из серверного контекста сессии.
export const buildPasswordUserFilter = ({ userId, tenantId }) => {
  if (!userId || !tenantId) return null
  return {
    _id: userId,
    tenantId,
    archive: { $ne: true },
  }
}

const validateNewPassword = (value) => {
  if (typeof value !== 'string' || value.length < PASSWORD_MIN_LENGTH) {
    return 'INVALID_NEW_PASSWORD'
  }
  if (value.length > PASSWORD_MAX_LENGTH) return 'NEW_PASSWORD_TOO_LONG'
  return ''
}

const readStoredPassword = async (filter) => {
  const user = await Users.findOne(filter).select('password').lean()
  if (!user?._id) return null
  return typeof user.password === 'string' ? user.password : ''
}

export const getPasswordStatus = async ({ userId, tenantId }) => {
  const filter = buildPasswordUserFilter({ userId, tenantId })
  if (!filter) return { ok: false, reason: 'USER_NOT_FOUND' }
  const stored = await readStoredPassword(filter)
  if (stored === null) return { ok: false, reason: 'USER_NOT_FOUND' }
  return { ok: true, hasPassword: stored.length > 0 }
}

export const changeOrSetPassword = async ({
  userId,
  tenantId,
  currentPassword,
  newPassword,
}) => {
  const filter = buildPasswordUserFilter({ userId, tenantId })
  if (!filter) return { ok: false, reason: 'USER_NOT_FOUND' }

  const invalid = validateNewPassword(newPassword)
  if (invalid) return { ok: false, reason: invalid }

  const stored = await readStoredPassword(filter)
  if (stored === null) return { ok: false, reason: 'USER_NOT_FOUND' }
  const hasPassword = stored.length > 0

  if (hasPassword) {
    if (typeof currentPassword !== 'string' || !currentPassword) {
      return { ok: false, reason: 'CURRENT_PASSWORD_REQUIRED' }
    }
    const matches = isPasswordHash(stored)
      ? await bcrypt.compare(currentPassword, stored)
      : stored === currentPassword
    if (!matches) return { ok: false, reason: 'CURRENT_PASSWORD_INVALID' }
  }

  const password = await bcrypt.hash(newPassword, 10)

  // Атомарный compare-and-update: фильтр содержит текущее сохранённое значение
  // (или требование пустого пароля), поэтому одновременная установка/смена
  // другим запросом не перезаписывается проигравшей стороной.
  const updated = hasPassword
    ? await Users.findOneAndUpdate(
        { ...filter, password: stored },
        { $set: { password } },
        { new: false }
      )
    : await Users.findOneAndUpdate(
        {
          ...filter,
          $or: [
            { password: '' },
            { password: null },
            { password: { $exists: false } },
          ],
        },
        { $set: { password } },
        { new: false }
      )

  if (!updated) {
    return {
      ok: false,
      reason: hasPassword ? 'PASSWORD_CHANGED' : 'PASSWORD_ALREADY_SET',
    }
  }

  return { ok: true, mode: hasPassword ? 'change' : 'set' }
}
