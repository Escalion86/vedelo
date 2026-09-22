'use client'

import { useAtomValue } from 'jotai'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import tariffsAtom from '@state/atoms/tariffsAtom'
import { getLearningAccess } from './learningAccess.mjs'

export default function useLearningAccess() {
  const user = useAtomValue(loggedUserAtom)
  const tariffs = useAtomValue(tariffsAtom)
  return (article) => getLearningAccess(article, user, tariffs)
}
