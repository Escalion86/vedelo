'use client'

import IconActionButton from '@components/IconActionButton'
import { faTrashAlt } from '@fortawesome/free-regular-svg-icons'
import Input from '@components/Input'
import Textarea from '@components/Textarea'
import ComboBox from '@components/ComboBox'
import { proposalLineFromService } from '@helpers/proposalWorkflow'

export default function ProposalLineEditor({
  line,
  index,
  services,
  onChange,
  onRemove,
}) {
  const missingService =
    line.serviceId &&
    !services.some((service) => String(service._id) === String(line.serviceId))
  return (
    <div className="proposal-line-editor space-y-2 rounded border border-gray-200 p-3">
      <div className="flex items-start gap-2">
        <ComboBox
          label="Услуга или своя позиция"
          help="Услуга подставляет название, описание и цену из каталога. Их можно изменить только для этого КП — каталог не изменится. Своя позиция позволяет указать произвольную услугу."
          className="min-w-0 flex-1"
          noMargin
          value={line.serviceId || ''}
          items={[
            { value: '', name: 'Своя позиция' },
            ...(missingService
              ? [
                  {
                    value: line.serviceId,
                    name: `${line.title} (сохранённая услуга)`,
                  },
                ]
              : []),
            ...services.map((service) => ({
              value: String(service._id),
              name: service.title,
            })),
          ]}
          onChange={(id) => {
            const service = services.find((item) => String(item._id) === id)
            onChange(
              service ? proposalLineFromService(service) : { serviceId: '' }
            )
          }}
        />
        <IconActionButton
          icon={faTrashAlt}
          variant="danger"
          size="sm"
          type="button"
          title={`Удалить позицию ${index + 1}`}
          className="mt-5 shrink-0"
          onClick={onRemove}
        />
      </div>
      <div className="tablet:grid-cols-[minmax(0,1fr)_190px] grid grid-cols-1 gap-2">
        <Input
          inputClassName="min-w-0"
          label="Название"
          ariaLabel={`Название позиции ${index + 1}`}
          noMargin
          fullWidth
          value={line.title}
          onChange={(title) => onChange({ title })}
          placeholder="Что входит в предложение"
        />
        <Input
          inputClassName="min-w-0"
          label="Цена"
          ariaLabel={`Цена позиции ${index + 1}`}
          type="number"
          min={0}
          step={1000}
          decimalScale={2}
          postfix="₽"
          noMargin
          fullWidth
          value={line.price}
          onChange={(price) => onChange({ price })}
        />
      </div>
      <Textarea
        label="Описание для клиента"
        help="Этот текст увидит клиент в составе варианта. Уточните, что входит в услугу и какие есть ограничения."
        ariaLabel={`Описание позиции ${index + 1}`}
        noMargin
        rows={3}
        value={line.description || ''}
        onChange={(description) => onChange({ description })}
      />
    </div>
  )
}
