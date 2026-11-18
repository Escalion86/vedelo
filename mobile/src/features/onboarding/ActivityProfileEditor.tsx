import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, View } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Notice, PageHeader, Screen, SectionTitle, Surface } from '../../shared/ui/components'
import { MOBILE_SETTINGS_QUERY_KEY, readMobileTerminologySettings } from '../../shared/hooks/useWorkItemTerminology'
import { getAuthSessionEpoch } from '../../shared/auth/tokenStore'
import type { MobileSettings } from '../../shared/domain/types'
import { cacheSettings } from '../settings/settingsEditor'
import { ActivityFields } from './ActivityFields'
import {
  activityTerminology,
  readActivityOnboarding,
  readActivityProfile,
  validateActivityDraft,
  writeActivityProfile,
  type ActivityDraft,
  type ActivityPreset,
  type ActivityProfile,
} from './activityProfile'

function ActivityProfileForm({ profile, presets, mandatory, onSaved }: {
  profile: ActivityProfile
  presets: ActivityPreset[]
  mandatory?: boolean
  onSaved?: (profile: ActivityProfile) => void
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<ActivityDraft>({
    preset: profile.preset,
    otherDescription: profile.otherDescription,
    terminology: mandatory && profile.terminology !== 'auto' ? profile.terminology : undefined,
  })
  const [validation, setValidation] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const save = async () => {
    if (busy.current) return
    const issue = validateActivityDraft(draft)
    setValidation(issue)
    if (issue) return
    busy.current = true
    const authEpoch = getAuthSessionEpoch()
    setSaving(true)
    setError('')
    try {
      const current = await writeActivityProfile({ ...draft, ...(mandatory ? { terminology: activityTerminology(draft) } : {}) })
      if (authEpoch !== getAuthSessionEpoch()) return
      if (current.required || current.preset !== draft.preset) throw new Error('INVALID_ACTIVITY_RESPONSE')
      await queryClient.cancelQueries({ queryKey: MOBILE_SETTINGS_QUERY_KEY })
      if (authEpoch !== getAuthSessionEpoch()) return
      queryClient.setQueriesData<MobileSettings>({ queryKey: MOBILE_SETTINGS_QUERY_KEY }, (settings) => settings && ({
        ...settings,
        custom: { ...settings.custom, onboardingActivityPreset: current.preset, onboardingActivityOtherDescription: current.otherDescription, primaryEntityTerminology: current.terminology },
      }))
      void queryClient.fetchQuery({ queryKey: MOBILE_SETTINGS_QUERY_KEY, queryFn: readMobileTerminologySettings, staleTime: 0 }).then((settings) => {
        if (settings?._id && authEpoch === getAuthSessionEpoch()) return cacheSettings(queryClient, settings, 'terminology')
      }).catch(() => undefined)
      setSaved(true)
      onSaved?.(current)
    } catch {
      setError('Не удалось сохранить вид деятельности. Проверьте подключение и повторите.')
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  return <>
    <ActivityFields draft={draft} presets={presets} error={validation} disabled={saving} terminology={mandatory} change={(value) => {
      setDraft(value)
      setValidation('')
      setError('')
      setSaved(false)
    }} />
    {error ? <Notice tone="danger" message={error} /> : null}
    {saved ? <Notice tone="success" message="Вид деятельности сохранён." /> : null}
    <Button testID={mandatory ? 'activity-profile-continue' : 'activity-profile-save'} title={mandatory ? 'Сохранить и продолжить' : 'Сохранить вид деятельности'} loading={saving} disabled={saved || !presets.length} onPress={() => void save()} />
  </>
}

export function RequiredActivityProfile({ profile, presets, onSaved }: {
  profile: ActivityProfile
  presets: ActivityPreset[]
  onSaved: (profile: ActivityProfile) => void
}) {
  return <Modal visible animationType="fade" onRequestClose={() => undefined}>
    <View style={{ flex: 1 }} accessibilityViewIsModal>
      <Screen keyboardShouldPersistTaps="handled">
        <PageHeader title="Вид деятельности" />
        <Surface><ActivityProfileForm profile={profile} presets={presets} mandatory onSaved={onSaved} /></Surface>
      </Screen>
    </View>
  </Modal>
}

export function ActivityProfileSettings({ onSaved }: { onSaved?: (profile: ActivityProfile) => void }) {
  const [data, setData] = useState<{ profile: ActivityProfile; presets: ActivityPreset[] } | null>(null)
  const [error, setError] = useState(false)
  const load = useCallback(async () => {
    setError(false)
    try {
      const [profile, onboarding] = await Promise.all([readActivityProfile(), readActivityOnboarding()])
      setData({ profile, presets: onboarding.presets })
    } catch { setError(true) }
  }, [])
  useEffect(() => { void load() }, [load])

  return <Surface>
    <SectionTitle>Вид деятельности</SectionTitle>
    {data?.profile.canEdit ? <ActivityProfileForm profile={data.profile} presets={data.presets} onSaved={onSaved} /> : data ? <Notice message="Изменить вид деятельности может владелец пространства." />
      : error ? <><Notice tone="warning" message="Не удалось загрузить вид деятельности." /><Button title="Повторить загрузку" variant="secondary" onPress={() => void load()} /></>
        : <Notice message="Загружаем виды деятельности…" />}
  </Surface>
}
