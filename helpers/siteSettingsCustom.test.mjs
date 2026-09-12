import test from 'node:test'
import assert from 'node:assert/strict'

import { mergeSiteSettingsCustom } from './siteSettingsCustom.mjs'

test('partial custom settings update preserves completed onboarding', () => {
  assert.deepEqual(
    mergeSiteSettingsCustom(
      {
        firstRunWizardCompleted: true,
        onboardingActivityPreset: 'events',
      },
      { defaultEventDurationMinutes: 90 }
    ),
    {
      firstRunWizardCompleted: true,
      onboardingActivityPreset: 'events',
      defaultEventDurationMinutes: 90,
    }
  )
})

test('partial custom settings update accepts map-shaped stored settings', () => {
  assert.deepEqual(
    mergeSiteSettingsCustom(
      new Map([
        ['firstRunWizardCompleted', true],
        ['defaultEventDurationMinutes', 60],
      ]),
      { defaultEventDurationMinutes: 120 }
    ),
    {
      firstRunWizardCompleted: true,
      defaultEventDurationMinutes: 120,
    }
  )
})
