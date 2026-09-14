import type { SyncRunState } from '../sync/syncState'

export type SyncStatePresentation = {
  title: string
  description: string
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'blue'
}

const formatMoment = (value?: string | null, now = new Date()) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  return sameDay
    ? `сегодня в ${date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
}

const lastSuccessSuffix = (state: SyncRunState, now: Date) => {
  const moment = formatMoment(state.lastSuccessAt, now)
  return moment ? ` Последняя успешная — ${moment}.` : ''
}

export const getSyncStatePresentation = (
  state: SyncRunState | null,
  now = new Date()
): SyncStatePresentation => {
  if (!state || state.status === 'never') {
    return {
      title: 'Ещё не синхронизировано',
      description: 'Подключитесь к сети, чтобы отправить локальные данные.',
      tone: 'neutral',
    }
  }
  if (state.status === 'pending') {
    return {
      title: 'Есть неотправленные изменения',
      description:
        'Данные сохранены на телефоне и ожидают ближайшей синхронизации.',
      tone: 'warning',
    }
  }
  if (state.status === 'syncing') {
    return {
      title: 'Идёт синхронизация',
      description: 'Отправляем изменения и получаем актуальные данные.',
      tone: 'blue',
    }
  }
  if (state.status === 'success') {
    const moment = formatMoment(state.lastSuccessAt, now)
    return {
      title: 'Всё синхронизировано',
      description: moment
        ? `Последняя успешная синхронизация — ${moment}.`
        : 'Локальные данные актуальны.',
      tone: 'success',
    }
  }
  if (state.status === 'attention') {
    return {
      title: 'Требуется внимание',
      description: `${state.issueCount} ${
        state.issueCount === 1
          ? 'элемент не отправлен'
          : 'элементов не отправлено'
      }. Откройте очередь для повтора или решения конфликта.`,
      tone: 'warning',
    }
  }
  if (state.status === 'offline') {
    return {
      title: 'Нет сети',
      description: `Изменения сохранены на телефоне и будут отправлены позже.${lastSuccessSuffix(state, now)}`,
      tone: 'warning',
    }
  }
  if (state.status === 'interrupted') {
    return {
      title: 'Предыдущая попытка прервана',
      description: `Очередь восстановлена и будет отправлена повторно.${lastSuccessSuffix(state, now)}`,
      tone: 'warning',
    }
  }
  const errorDescription = {
    auth: 'Нужно повторно войти в Ведело.',
    rate_limit: 'Сервер временно ограничил запросы. Повторите позже.',
    server: 'Сервер временно недоступен. Локальные данные не потеряны.',
    network: 'Не удалось связаться с сервером. Проверьте сеть.',
    interrupted: 'Предыдущая попытка была прервана.',
    unknown: 'Повторите синхронизацию.',
  }[state.lastErrorCode || 'unknown']
  return {
    title: 'Синхронизация не завершена',
    description: `${errorDescription}${lastSuccessSuffix(state, now)}`,
    tone: 'danger',
  }
}
