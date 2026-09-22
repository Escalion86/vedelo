const getPushDevicePresentation = ({ available, permission, subscribed }) => {
  if (available === null) {
    return {
      label: 'Проверяем...',
      description: 'Определяем состояние push на этом устройстве.',
      className: 'border-gray-300 bg-gray-100 text-gray-700',
    }
  }

  if (!available) {
    return {
      label: 'Не поддерживается',
      description:
        'Этот браузер или режим приложения не поддерживает push-уведомления.',
      className: 'border-gray-300 bg-gray-100 text-gray-700',
    }
  }

  if (permission === 'denied') {
    return {
      label: 'Запрещено браузером',
      description:
        'Разрешите уведомления в настройках браузера или приложения.',
      className: 'border-red-300 bg-red-50 text-red-700',
    }
  }

  if (subscribed) {
    return {
      label: 'Подключено',
      description: 'Это устройство получает Web/PWA push-уведомления.',
      className: 'border-emerald-300 bg-emerald-50 text-emerald-700',
    }
  }

  return {
    label: 'Не подключено',
    description: 'На этом устройстве push-уведомления не настроены.',
    className: 'border-amber-300 bg-amber-50 text-amber-700',
  }
}

const formatPushDevicesCount = (count) => {
  const value = Math.max(0, Number(count) || 0)
  const mod100 = value % 100
  const mod10 = value % 10
  const noun =
    mod100 >= 11 && mod100 <= 14
      ? 'устройств'
      : mod10 === 1
        ? 'устройство'
        : mod10 >= 2 && mod10 <= 4
          ? 'устройства'
          : 'устройств'
  return `${value} ${noun}`
}

export { formatPushDevicesCount, getPushDevicePresentation }
