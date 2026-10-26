import AppButton from '@components/AppButton'
import { formatClipboardPhone } from '@helpers/phoneNumbersFromText.mjs'

const ClipboardPhoneChoices = ({ phones, onSelect, closeModal }) => (
  <div
    className="flex flex-col gap-3 py-2"
    onKeyDown={(event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeModal()
      }
    }}
  >
    <p className="text-sm text-general">
      В буфере найдено несколько номеров. Выберите, какой вставить.
    </p>
    <div className="flex flex-col gap-2">
      {phones.map((phone, index) => (
        <AppButton
          key={phone}
          variant="secondary"
          className="min-h-11 w-full"
          autoFocus={index === 0}
          onClick={() => {
            onSelect(phone)
            closeModal()
          }}
        >
          {formatClipboardPhone(phone)}
        </AppButton>
      ))}
    </div>
  </div>
)

const selectClipboardPhoneFunc = (phones, onSelect) => ({
  title: 'Выбор номера телефона',
  closeButtonName: 'Отмена',
  Children: ClipboardPhoneChoices,
  childrenProps: { phones, onSelect },
})

export default selectClipboardPhoneFunc
