'use client'
import ComboBox from './ComboBox'
import Input from './Input'
import Notice from './Notice'

const modes = [
  { value: 'event', name: 'Событие в календаре' },
  { value: 'task', name: 'Задача Google Tasks' },
  { value: 'none', name: 'Не синхронизировать' },
]
export default function GoogleAdditionalSyncFields({ mode, onModeChange, duration, onDurationChange, paused, authorized }) {
  return <div className="flex min-w-0 flex-col gap-2">
    <ComboBox label="В Google (тест)" items={modes} value={mode} onChange={onModeChange} fullWidth noMargin />
    {mode === 'event' ? <Input label="Длительность события" type="number" min={5} max={1440} value={duration} onChange={onDurationChange} postfix="мин" noMargin fullWidth /> : null}
    {mode === 'task' ? <Notice tone="info">В Google передаётся только дата. Время напоминания сохраняется в Ведело.</Notice> : null}
    {mode === 'task' && !authorized ? <Notice tone="warning">В интеграциях нужно повторно разрешить доступ к Google Tasks.</Notice> : null}
    {paused ? <Notice tone="info">Синхронизация приостановлена. Выбор сохранится до её включения.</Notice> : null}
  </div>
}
