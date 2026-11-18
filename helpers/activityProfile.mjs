import {
  KNOWN_ACTIVITY_PRESETS,
  PRIMARY_ENTITY_TERMINOLOGY_VALUES,
} from './workItemTerminology.mjs'

export const ACTIVITY_PROFILE_VERSION = 1
export const ACTIVITY_DESCRIPTION_MAX_LENGTH = 120

const presets = new Set(KNOWN_ACTIVITY_PRESETS)

const readCustom = (settings, key) =>
  typeof settings?.custom?.get === 'function'
    ? settings.custom.get(key)
    : settings?.custom?.[key]

export const normalizeActivityPreset = (value) => {
  const preset = typeof value === 'string' ? value.trim() : ''
  return presets.has(preset) ? preset : ''
}

export const normalizeActivityDescription = (value) =>
  typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : ''

export const canEditActivityProfile = ({ user, tenantId } = {}) =>
  Boolean(
    tenantId &&
      user?._id &&
      String(user._id) === String(tenantId) &&
      !user.archive &&
      !user.impersonation?.active
  )

export const getActivityProfile = (settings, canEdit = false) => {
  const preset = normalizeActivityPreset(
    readCustom(settings, 'onboardingActivityPreset')
  )
  const otherDescription =
    preset === 'other'
      ? normalizeActivityDescription(
          readCustom(settings, 'onboardingActivityOtherDescription')
        )
      : ''
  const storedTerminology = readCustom(settings, 'primaryEntityTerminology')
  const terminology = PRIMARY_ENTITY_TERMINOLOGY_VALUES.includes(storedTerminology)
    ? storedTerminology
    : 'auto'
  const completed = readCustom(settings, 'firstRunWizardCompleted') === true
  return {
    required: canEdit && completed && (!preset || (preset === 'other' && !otherDescription)),
    canEdit,
    preset,
    otherDescription,
    terminology,
    completed,
  }
}

export const hasConfirmedActivityProfile = (settings) =>
  readCustom(settings, 'onboardingActivityProfileVersion') === ACTIVITY_PROFILE_VERSION

export const allowLegacyActivitySelection = (settings, context) =>
  canEditActivityProfile(context) &&
  !hasConfirmedActivityProfile(settings) &&
  readCustom(settings, 'firstRunWizardCompleted') !== true

export const validateActivityProfile = (input) => {
  const preset = normalizeActivityPreset(input?.preset)
  const otherDescription =
    preset === 'other' ? normalizeActivityDescription(input?.otherDescription) : ''
  const terminology = input?.terminology
  if (!preset)
    return { code: 'ACTIVITY_REQUIRED', message: 'Выберите сферу деятельности', field: 'preset' }
  if (preset === 'other' && !otherDescription)
    return { code: 'ACTIVITY_DESCRIPTION_REQUIRED', message: 'Укажите, чем вы занимаетесь', field: 'otherDescription' }
  if (otherDescription.length > ACTIVITY_DESCRIPTION_MAX_LENGTH)
    return {
      code: 'ACTIVITY_DESCRIPTION_TOO_LONG',
      message: `Укажите сферу деятельности не длиннее ${ACTIVITY_DESCRIPTION_MAX_LENGTH} символов`,
      field: 'otherDescription',
    }
  if (terminology !== undefined && !PRIMARY_ENTITY_TERMINOLOGY_VALUES.includes(terminology))
    return { code: 'TERMINOLOGY_INVALID', message: 'Выберите, как называть основную работу', field: 'terminology' }
  return {
    value: { preset, otherDescription, ...(terminology === undefined ? {} : { terminology }) },
  }
}

export const getActivityProfileFields = ({ preset, otherDescription, terminology }) => ({
  onboardingActivityPreset: preset,
  onboardingActivityOtherDescription: otherDescription,
  onboardingActivityProfileVersion: ACTIVITY_PROFILE_VERSION,
  ...(terminology === undefined ? {} : { primaryEntityTerminology: terminology }),
})
