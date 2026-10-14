import { useCallback, useLayoutEffect, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import { useAuth } from '../../shared/auth/AuthProvider'
// Локальные результаты не должны попасть в другой профиль/работу после ожидания сети.
export function useReviewLifetime(entityId: string) {
  const {user}=useAuth(), scope=`${user?._id}:${user?.tenantId}:${entityId}`
  const life=useRef({active:true,revision:0})
  useLayoutEffect(()=>{life.current.active=true;++life.current.revision;return()=>{life.current.active=false;++life.current.revision}},[scope])
  useFocusEffect(useCallback(()=>{life.current.active=true;return()=>{life.current.active=false;++life.current.revision}},[]))
  return useCallback(()=>{const revision=life.current.revision;return()=>life.current.active && life.current.revision===revision},[])
}
