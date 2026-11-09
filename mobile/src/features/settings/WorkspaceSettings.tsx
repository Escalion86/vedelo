import { useState } from 'react'
import { Button, CompactField, Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { FilterOverlay } from '../../shared/ui/FilterOverlay'
import { FieldHelp } from '../../shared/ui/FieldHelp'
import { getFieldHelp } from '../../shared/domain/fieldHelp'
import { useSettingsEditor, type SettingsConfig } from './settingsEditor'

const zones = [
  ['UTC', 'UTC'], ['Europe/Kaliningrad', 'Калининград'], ['Europe/Moscow', 'Москва'],
  ['Europe/Samara', 'Самара'], ['Asia/Yekaterinburg', 'Екатеринбург'], ['Asia/Omsk', 'Омск'],
  ['Asia/Krasnoyarsk', 'Красноярск'], ['Asia/Irkutsk', 'Иркутск'], ['Asia/Yakutsk', 'Якутск'],
  ['Asia/Vladivostok', 'Владивосток'], ['Asia/Magadan', 'Магадан'], ['Asia/Kamchatka', 'Камчатка'],
] as const
type Workspace = { timeZone: string; defaultEventDurationMinutes: string; eventFormVariant: 'classic' | 'compact'; showColleagueTransferFields: boolean }
const initial: SettingsConfig<Workspace>['initial'] = (settings) => ({
  timeZone: settings?.timeZone || 'Asia/Krasnoyarsk',
  defaultEventDurationMinutes: String(settings?.custom?.defaultEventDurationMinutes ?? 60),
  eventFormVariant: settings?.custom?.eventFormVariant === 'classic' ? 'classic' : 'compact',
  showColleagueTransferFields: settings?.custom?.showColleagueTransferFields === true,
})
const config: SettingsConfig<Workspace> = {
  scope: 'workspace', endpoint: '/mobile/v1/settings/workspace', initial,
  payload: (draft, original, settings) => {
    if (!settings?.syncVersion) throw Error('Сначала загрузите настройки организации.')
    const update: Record<string, unknown> = { syncVersion: settings.syncVersion }
    for (const key of Object.keys(draft) as (keyof Workspace)[]) {
      if (draft[key] === original[key]) continue
      if (key === 'defaultEventDurationMinutes') {
        const value = Number(draft[key])
        if (!/^\d+$/.test(draft[key]) || value < 15 || value > 1440) throw Error('Укажите длительность от 15 до 1440 минут.')
        update[key] = value
      } else update[key] = draft[key]
    }
    return update
  },
  matches: (saved, draft, original) => {
    const current = initial(saved)
    return (Object.keys(draft) as (keyof Workspace)[]).every(key =>
      draft[key] === original[key] || current[key] === (key === 'defaultEventDurationMinutes' ? String(Number(draft[key])) : draft[key]))
  },
}

export function WorkspaceSettings() {
  const editor = useSettingsEditor(config)
  const [zoneOpen, setZoneOpen] = useState(false)
  const { draft } = editor
  const disabled = !editor.ready || editor.saving || editor.reading
  return <Surface>
    <SectionTitle>Настройки организации</SectionTitle>
    <FieldHelp label="Часовой пояс" text={getFieldHelp('settings.timeZone')} />
    <FilterOverlay title={`Часовой пояс: ${zones.find(([value]) => value === draft.timeZone)?.[1] || draft.timeZone}`} disabled={disabled}
      visible={zoneOpen} onOpen={() => setZoneOpen(true)} onClose={() => setZoneOpen(false)}
      options={zones.map(([value, label]) => ({ value, label, selected: draft.timeZone === value }))}
      onSelect={(timeZone) => { editor.change({ ...draft, timeZone }); setZoneOpen(false) }} />
    <CompactField label="Стандартная длительность, мин" help={getFieldHelp('settings.defaultDuration')} value={draft.defaultEventDurationMinutes} keyboardType="number-pad" editable={!disabled}
      onChangeText={defaultEventDurationMinutes => editor.change({ ...draft, defaultEventDurationMinutes })} />
    <FieldHelp label="Форма" text={getFieldHelp('settings.eventForm')} />
    <Button title={`Форма: ${draft.eventFormVariant === 'classic' ? 'Классическая' : 'Компактная'}`} variant="secondary" disabled={disabled}
      onPress={() => editor.change({ ...draft, eventFormVariant: draft.eventFormVariant === 'classic' ? 'compact' : 'classic' })} />
    <Button title={`Передача коллеге: ${draft.showColleagueTransferFields ? 'включена' : 'выключена'}`} variant="secondary" disabled={disabled}
      accessibilityState={{ selected: draft.showColleagueTransferFields }} onPress={() => editor.change({ ...draft, showColleagueTransferFields: !draft.showColleagueTransferFields })} />
    {editor.readError || editor.error ? <Notice tone="warning" message={editor.readError || editor.error} /> : null}
    {editor.readError || editor.error ? <Button title="Загрузить актуальные настройки" variant="secondary" disabled={editor.saving} onPress={editor.retry} /> : null}
    {editor.success ? <Notice tone="success" message={editor.success} /> : null}
    <Button title="Сохранить настройки организации" loading={editor.saving} disabled={disabled || !editor.dirty} onPress={() => void editor.save()} />
  </Surface>
}
