'use client'

import Notice from '@components/Notice'
import AiFieldHighlight from '@components/AiFieldHighlight'
import { AI_EDIT_LABELS } from '@helpers/aiEditContract.mjs'

const label = (value, field) => {
  if (value === null || value === undefined || value === '') return 'Не указано'
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
  if (field === 'amount') return `${Number(value).toLocaleString('ru-RU')} ₽`
  if (field === 'date') return new Date(value).toLocaleString('ru-RU')
  if (typeof value === 'object') return JSON.stringify(value)
  return AI_EDIT_LABELS[value] || String(value)
}

export default function AiEventPlanSummary({ plan, error, started }) {
  if (!plan) return null
  return (
    <div className="mb-3 space-y-2" aria-label="Изменения ИИ перед сохранением">
      <Notice tone="info">
        ИИ подготовил изменения. Проверьте подсвеченные поля и сохраните карточку.
        До сохранения изменения не применяются.
      </Notice>
      {plan.steps.filter((step) => step.entity !== 'event').map((step, index) => (
        <AiFieldHighlight active key={index} className="p-3 text-sm">
          <p className="font-semibold">
            {step.entity === 'client' ? 'Изменения общей карточки клиента' : step.operation === 'create' ? 'Новая оплата' : 'Изменения оплаты'}
          </p>
          {step.changes.map((change) => (
            <p key={change.field} className="break-words">
              {change.label}: {step.operation === 'update' ? `${label(change.before, change.field)} → ` : ''}{label(change.after, change.field)}
            </p>
          ))}
        </AiFieldHighlight>
      ))}
      {error ? <Notice tone="error" role="alert">{error} {started ? 'Поля зафиксированы для безопасного повтора. Нажмите «Повторить / сверить», чтобы завершить сохранение без дублей оплат.' : ''}</Notice> : null}
    </div>
  )
}
