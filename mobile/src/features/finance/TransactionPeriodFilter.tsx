import { PeriodPicker, type PeriodPreset } from '../../shared/ui/PeriodPicker'
import { localDay } from '../../shared/ui/periodPickerDates'
import { nextWeekend, type DateRange } from './filters'

const extraPresets: readonly PeriodPreset[] = [
  { label: 'Завтра', range: () => { const now = new Date(); const day = localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12)); return { from: day, to: day } } },
  { label: 'На выходных', range: () => nextWeekend() },
]
export function TransactionPeriodFilter({ range, onChange, activeDates }: { range: DateRange; onChange: (range: DateRange) => void; activeDates: ReadonlySet<string> }) {
  return <PeriodPicker value={range} onChange={onChange} activeDates={activeDates} extraPresets={extraPresets} testID="transaction-period" />
}
