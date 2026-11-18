import { api } from '../../shared/api/client'
import type { PrimaryEntityTerminology } from '../../shared/domain/workItemTerminology'
import { resolveMobileWorkItemTerminology } from '../../shared/domain/workItemTerminology'

export type ActivityPreset = {
  key: string
  title: string
  description: string
  starterServices: Array<{ title: string; description?: string }>
}

export type ActivityDraft = {
  preset: string
  otherDescription: string
  terminology?: PrimaryEntityTerminology
}

export type ActivityProfile = Required<ActivityDraft> & {
  required: boolean
  canEdit: boolean
  completed: boolean
}

export type ActivityOnboarding = {
  completed: boolean
  activityProfile?: ActivityProfile
  presets: ActivityPreset[]
  servicesCount: number
  settings?: { defaultTown?: string; timeZone?: string }
}

export const MAX_ACTIVITY_DESCRIPTION = 120

export const activityDescription = (value: string) => value.replace(/\s+/g, ' ').trim()

export function validateActivityDraft(draft: ActivityDraft) {
  if (!draft.preset) return 'Выберите вид деятельности.'
  if (draft.preset === 'other' && !activityDescription(draft.otherDescription)) {
    return 'Коротко опишите, чем вы занимаетесь.'
  }
  return ''
}

export const activityPayload = ({ preset, otherDescription, terminology }: ActivityDraft) => ({
  preset,
  otherDescription: preset === 'other' ? activityDescription(otherDescription) : '',
  ...(terminology ? { terminology } : {}),
})

export const activityTerminology = (draft: ActivityDraft) => draft.terminology || resolveMobileWorkItemTerminology({
  _id: '', custom: { onboardingActivityPreset: draft.preset },
}).mode

export const readActivityOnboarding = async () => (
  await api.get<{ success: true; data: ActivityOnboarding }>('/mobile/v1/onboarding')
).data

export const readActivityProfile = async () => (
  await api.get<{ success: true; data: ActivityProfile }>('/activity-profile')
).data

export const writeActivityProfile = async (draft: ActivityDraft) => (
  await api.patch<{ success: true; data: ActivityProfile }>('/activity-profile', activityPayload(draft))
).data
