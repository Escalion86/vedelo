import ComboBox from '@components/ComboBox'
import Input from '@components/Input'
import { ACTIVITY_DESCRIPTION_MAX_LENGTH } from '@helpers/activityProfile.mjs'
import { getRecommendedBuiltInContractTemplates } from '@helpers/builtInContractTemplates.mjs'
import { ONBOARDING_ACTIVITY_PRESETS } from '@helpers/onboardingPresets.mjs'
import { resolveWorkItemTerminology } from '@helpers/workItemTerminology.mjs'

const activityOptions = ONBOARDING_ACTIVITY_PRESETS.map(({ key, title }) => ({
  value: key,
  name: title,
}))

export default function ActivityProfileFields({ value, onChange, attempted }) {
  const { preset, otherDescription, terminology } = value
  const invalidPreset = attempted && !preset
  const invalidDescription = attempted && preset === 'other' && !otherDescription.trim()
  const recommendation = resolveWorkItemTerminology({
    custom: { onboardingActivityPreset: preset },
  })
  const templates = getRecommendedBuiltInContractTemplates(preset)

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ComboBox
        label="Сфера деятельности"
        items={activityOptions}
        placeholder="Выберите сферу деятельности"
        value={preset}
        onChange={(next) => onChange({ ...value, preset: next || '' })}
        error={invalidPreset}
        required
        noMargin
        fullWidth
      />
      {invalidPreset && <p className="text-danger text-xs" role="alert">Выберите сферу деятельности</p>}
      {preset === 'other' && (
        <Input
          label="Чем именно вы занимаетесь?"
          ariaLabel="Чем именно вы занимаетесь?"
          placeholder="Например, реставрация мебели"
          value={otherDescription}
          onChange={(next) => onChange({ ...value, otherDescription: next })}
          maxLength={ACTIVITY_DESCRIPTION_MAX_LENGTH}
          error={invalidDescription}
          required
          noMargin
          fullWidth
        />
      )}
      {invalidDescription && <p className="text-danger text-xs" role="alert">Укажите, чем вы занимаетесь</p>}
      {preset && (
        <ComboBox
          label="Как называть основную работу"
          value={terminology}
          items={[
            { value: 'auto', name: `По сфере деятельности — ${recommendation.pluralCapitalized}` },
            { value: 'orders', name: 'Заказы' },
            { value: 'events', name: 'Мероприятия' },
          ]}
          onChange={(next) => onChange({ ...value, terminology: next || 'auto' })}
          noMargin
          fullWidth
        />
      )}
      {templates.length > 0 && (
        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
          <p className="font-semibold">Подходящие шаблоны договоров</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {templates.map(({ id, name }) => <li key={id}>{name}</li>)}
          </ul>
          <p className="mt-2 text-gray-500">Весь каталог доступен в разделе «Документы».</p>
        </div>
      )}
    </div>
  )
}
