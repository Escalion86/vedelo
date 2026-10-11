'use client'

import PeriodPicker from './PeriodPicker'
import {
  getNextWeekendRange,
  toDateInputValue,
} from '@helpers/transactionDateRange'

export default function TransactionDateRangeFilter({
  value,
  onChange,
  activeDateKeys,
  disabled,
}) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const key = toDateInputValue(tomorrow)
  return (
    <PeriodPicker
      value={value}
      onChange={onChange}
      activeDateKeys={activeDateKeys}
      disabled={disabled}
      extraPresets={[
        { id: 'tomorrow', label: 'Завтра', range: { from: key, to: key } },
        { id: 'weekend', label: 'На выходных', range: getNextWeekendRange() },
      ]}
    />
  )
}
