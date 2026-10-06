import { useCallback, useMemo, useRef } from 'react'
import { useFocusEffect } from 'expo-router'

// One lease covers reads AND actions. Late continuations cannot start another action.
export const useCommunicationSession = () => {
  const state = useRef({ active: true, epoch: 0, busy: false })
  useFocusEffect(useCallback(() => {
    state.current.active = true
    return () => { state.current.active = false; state.current.epoch += 1; state.current.busy = false }
  }, []))
  return useMemo(() => ({
    token: () => state.current.epoch,
    valid: (epoch: number) => state.current.active && state.current.epoch === epoch,
    busy: () => state.current.busy,
    begin: () => {
      if (!state.current.active || state.current.busy) return null
      state.current.busy = true
      return state.current.epoch
    },
    end: (epoch: number) => { if (state.current.epoch === epoch) state.current.busy = false },
  }), [])
}
