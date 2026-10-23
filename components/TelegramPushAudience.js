import AppButton from '@components/AppButton'
import { TELEGRAM_PUSH_AUDIENCES } from '@helpers/telegramPushAudience.mjs'

export default function TelegramPushAudience({ value, onChange, disabled }) {
  return (
    <fieldset disabled={disabled} className="min-w-0" aria-busy={disabled}>
      <legend className="mb-2 text-sm font-semibold">
        Push-уведомления о сообщениях
      </legend>
      <div className="flex flex-wrap gap-2">
        {TELEGRAM_PUSH_AUDIENCES.map((option) => (
          <AppButton
            key={option.value}
            variant={value === option.value ? 'primary' : 'secondary'}
            className="min-h-10 cursor-pointer disabled:cursor-not-allowed"
            disabled={disabled}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </AppButton>
        ))}
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--ui-secondary-text)]">
        Клиент — контакт с карточкой в вашей базе, в том числе созданной
        автоматически. Настройка влияет только на push: все сообщения остаются в
        переписке. Отключение push в карточке клиента сохраняет приоритет.
      </p>
    </fieldset>
  )
}
