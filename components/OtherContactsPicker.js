import Input from '@components/Input'
import InputWrapper from '@components/InputWrapper'
import AddIconButton from '@components/AddIconButton'
import { faTrashAlt } from '@fortawesome/free-solid-svg-icons'
import { faExchangeAlt } from '@fortawesome/free-solid-svg-icons/faExchangeAlt'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'
import getPersonFullName from '@helpers/getPersonFullName'
import IconActionButton from '@components/IconActionButton'

const OtherContactsPicker = ({
  contacts = [],
  clients = [],
  onSelectContact,
  onChangeComment,
  onRemoveContact,
  onEditContact,
  onViewContact,
  onAddContact,
  label = 'Прочие контакты',
}) => (
  <InputWrapper label={label} fullWidth>
    <div className="flex w-full flex-col gap-2">
      {contacts.map((contact, index) => {
        const contactClient = clients.find(
          (client) => client._id === contact.clientId
        )
        const contactName = getPersonFullName(contactClient, {
          fallback: 'Выберите клиента',
        })
        return (
          <div
            key={`other-contact-${index}`}
            className="flex min-w-0 flex-col gap-2 rounded border border-gray-200 bg-gray-50 p-2"
          >
            <button
              type="button"
              className="hover:shadow-card tablet:flex-row tablet:items-center tablet:justify-between flex w-full min-w-0 cursor-pointer flex-col items-start gap-1 rounded border border-gray-300 bg-white px-3 py-2 text-left text-sm shadow-sm transition"
              onClick={() =>
                contactClient
                  ? onViewContact?.(index)
                  : onSelectContact?.(index)
              }
              title={
                contactClient ? 'Открыть карточку клиента' : 'Выбрать клиента'
              }
            >
              <span className="min-w-0 font-semibold break-words text-gray-900">
                {contactName}
              </span>
              <span className="text-xs text-gray-500">
                {contactClient?.phone
                  ? `+${contactClient.phone}`
                  : 'Телефон не указан'}
              </span>
            </button>
            <div className="flex w-full min-w-0 items-end gap-2">
              <Input
                label="Кем является"
                value={contact.comment}
                onChange={(value) => onChangeComment?.(index, value)}
                className="min-w-0 flex-1"
                inputClassName="min-w-0"
                noMargin
                fullWidth
              />
              <div className="flex shrink-0 items-center gap-1.5 pb-0.5">
                {contactClient && (
                  <IconActionButton
                    icon={faPencilAlt}
                    onClick={() => onEditContact?.(index)}
                    title="Редактировать клиента"
                    variant="warning"
                    size="sm"
                  />
                )}
                <IconActionButton
                  icon={faExchangeAlt}
                  onClick={() => onSelectContact?.(index)}
                  title="Выбрать другого клиента"
                  variant="neutral"
                  size="sm"
                />
                <IconActionButton
                  icon={faTrashAlt}
                  onClick={() => onRemoveContact?.(index)}
                  title="Удалить контакт"
                  variant="danger"
                  size="sm"
                />
              </div>
            </div>
          </div>
        )
      })}
      {/* <button
        type="button"
        className="px-3 text-sm font-semibold text-gray-700 transition bg-white border border-gray-300 rounded shadow-sm cursor-pointer h-9 w-fit hover:bg-gray-50"
        onClick={onAddContact}
      >
        Добавить контакт
      </button> */}
      <div className="flex w-full justify-end">
        <AddIconButton
          onClick={onAddContact}
          title="Добавить контакт"
          label="Добавить контакт"
          size="sm"
          className="px-3"
        />
      </div>
    </div>
  </InputWrapper>
)

export default OtherContactsPicker
