import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import NetInfo, { useNetInfo } from '@react-native-community/netinfo'
import { api } from '../../shared/api/client'
import { useAuth } from '../../shared/auth/AuthProvider'
import type { MobileBilling } from '../billing/types'

export function useAiDraftAccess() {
  const { user } = useAuth()
  const [allowAi, setAllowAi] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const network = useNetInfo()
  const online = network.isConnected === true && network.isInternetReachable !== false
  useFocusEffect(useCallback(() => {
    let active = true
    setAllowAi(false)
    setError('')
    setLoading(true)
    if (!user?._id || !user?.tenantId) {
      setLoading(false)
      return
    }
    api.get<{ data: MobileBilling }>('/mobile/v1/billing').then((response) => {
      if (active) setAllowAi(response.data.currentTariff?.allowAi === true)
    }).catch(() => {
      if (active) setError('Не удалось проверить доступ к ИИ. Ручное заполнение доступно.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user?._id, user?.tenantId]))

  const assertAvailable = async () => {
    if (!allowAi) throw new Error('ИИ недоступен на текущем тарифе')
    const state = await NetInfo.fetch()
    if (state.isConnected !== true || state.isInternetReachable === false) {
      throw new Error('Для ИИ нужен интернет. Форму можно заполнить вручную.')
    }
  }
  return { allowAi, online, loading, error, assertAvailable }
}
