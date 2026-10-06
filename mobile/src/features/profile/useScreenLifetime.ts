import { useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'

// Local presentation lifetime: no changes to auth, sync or push ownership.
export const useScreenLifetime = () => {
  const state = useRef({ active: true, revision: 0 })
  useFocusEffect(useCallback(() => {
    state.current.active = true
    return () => { state.current.active = false; state.current.revision++ }
  }, []))
  return useCallback(() => {
    const revision = state.current.revision
    return () => state.current.active && state.current.revision === revision
  }, [])
}
