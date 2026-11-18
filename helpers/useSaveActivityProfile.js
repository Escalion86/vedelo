import { useQueryClient } from '@tanstack/react-query'
import { useSetAtom } from 'jotai'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import { getActivityProfileFields } from './activityProfile.mjs'
import { apiJson } from './apiClient'
import { queryKeys } from './queryKeys'

export const withActivityProfile = (settings, profile) => ({
  ...settings,
  custom: { ...settings?.custom, ...getActivityProfileFields(profile) },
})

export default function useSaveActivityProfile() {
  const queryClient = useQueryClient()
  const setSettings = useSetAtom(siteSettingsAtom)

  return async (profile) => {
    await queryClient.cancelQueries({ queryKey: queryKeys.siteSettings })
    const saved = await apiJson('/api/activity-profile', {
      method: 'PATCH',
      body: JSON.stringify(profile),
    })
    const next = saved.data
    setSettings((current) => withActivityProfile(current, next))
    queryClient.setQueryData(queryKeys.siteSettings, (current) =>
      current ? withActivityProfile(current, next) : undefined
    )
    return next
  }
}
