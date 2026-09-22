'use client'

import { useAtomValue } from 'jotai'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import modalsAtom from '@state/atoms/modalsAtom'
import { useLearning } from '@helpers/useLearning'

export default function LearningVisitTracker() {
  const settings = useAtomValue(siteSettingsAtom)
  const modals = useAtomValue(modalsAtom)
  useLearning({
    activity: 'visit',
    enabled:
      settings?.custom?.firstRunWizardCompleted === true && modals.length === 0,
  })
  return null
}
