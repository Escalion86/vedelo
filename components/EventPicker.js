'use client'

import PropTypes from 'prop-types'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'
import InputWrapper from '@components/InputWrapper'
import IconActionButton from '@components/IconActionButton'
import formatDate from '@helpers/formatDate'
import formatAddress from '@helpers/formatAddress'
import { useAtomValue } from 'jotai'
import { modalsFuncAtom } from '@state/atoms'
import useWorkItemTerminology from '@helpers/useWorkItemTerminology'

const EventPicker = ({
  selectedEvent,
  selectedEventId,
  onSelectClick,
  disabled,
  label,
  required,
  error,
  paddingY,
  fullWidth,
  showEditButton,
}) => {
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const terms = useWorkItemTerminology()
  const resolvedLabel = label || terms.labelCapitalized
  const handleEdit = () => {
    if (selectedEventId && !disabled) modalsFunc.event?.edit(selectedEventId)
  }

  const eventDateLabel = selectedEvent?.eventDate
    ? formatDate(selectedEvent.eventDate, false, true)
    : null
  const eventTimeLabel = selectedEvent?.eventDate
    ? new Date(selectedEvent.eventDate).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <InputWrapper
      label={resolvedLabel}
      required={required}
      error={error}
      paddingY={paddingY}
      fullWidth={fullWidth}
      disabled={disabled}
    >
      <div className="flex w-full flex-wrap items-center gap-2">
        <div
          className="flex flex-1 cursor-pointer justify-between rounded border border-gray-300 bg-white p-3 shadow-sm transition hover:shadow-card"
          onClick={disabled ? undefined : onSelectClick}
        >
          <div className="flex flex-col gap-0.5">
            <div className="text-base font-semibold text-gray-900">
              {selectedEvent
                ? formatAddress(selectedEvent?.address, terms.labelCapitalized)
                : 'Не выбрано'}
            </div>
            {selectedEvent && (
              <>
                <div className="text-sm text-gray-600">
                  {eventDateLabel && eventTimeLabel
                    ? `${eventDateLabel} ${eventTimeLabel}`
                    : eventDateLabel || '-'}
                </div>
                <div className="text-sm text-gray-600">
                  {formatAddress(
                    selectedEvent?.address,
                    'Локация не указана'
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        {showEditButton && selectedEventId && !disabled && (
          <IconActionButton
            icon={faPencilAlt}
            onClick={handleEdit}
            title={`Редактировать ${terms.accusative}`}
            variant="warning"
            size="lg"
            className="h-[50px] w-[50px]"
          />
        )}
      </div>
    </InputWrapper>
  )
}

EventPicker.propTypes = {
  selectedEvent: PropTypes.shape({
    eventDate: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
      PropTypes.instanceOf(Date),
    ]),
    address: PropTypes.shape({
      town: PropTypes.string,
      street: PropTypes.string,
      house: PropTypes.string,
      entrance: PropTypes.string,
      floor: PropTypes.string,
      flat: PropTypes.string,
      comment: PropTypes.string,
      link2Gis: PropTypes.string,
      linkYandexNavigator: PropTypes.string,
      link2GisShow: PropTypes.bool,
      linkYandexShow: PropTypes.bool,
    }),
  }),
  selectedEventId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onSelectClick: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  label: PropTypes.string,
  required: PropTypes.bool,
  error: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
  paddingY: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
  fullWidth: PropTypes.bool,
  showEditButton: PropTypes.bool,
}

EventPicker.defaultProps = {
  selectedEvent: null,
  selectedEventId: null,
  disabled: false,
  label: undefined,
  required: false,
  error: null,
  paddingY: true,
  fullWidth: false,
  showEditButton: true,
}

export default EventPicker
