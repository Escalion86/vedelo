'use client'

import { useAtomValue } from 'jotai'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import { resolveWorkItemTerminology } from '@helpers/workItemTerminology.mjs'

const useWorkItemTerminology = () => {
  const siteSettings = useAtomValue(siteSettingsAtom)
  return resolveWorkItemTerminology(siteSettings)
}

export default useWorkItemTerminology
