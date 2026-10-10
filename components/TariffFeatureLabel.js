'use client'

import FieldHelp from './FieldHelp'
import { getTariffFeatureHelp } from '@helpers/tariffFeatureHelp'

// Подпись строки возможностей тарифа с кнопкой «i».
// helpKey — ключ подсказки из helpers/tariffFeatureHelp.js; tariff нужен для строки ИИ,
// где текст зависит от включённой суммы.
export default function TariffFeatureLabel({ label, helpKey, tariff }) {
  const text = getTariffFeatureHelp(helpKey, tariff)
  if (!text) return label

  return (
    <span className="inline-flex items-center gap-0.5">
      {label}
      <FieldHelp
        text={text}
        label={typeof label === 'string' ? label : 'возможность тарифа'}
      />
    </span>
  )
}
