import QuickActionButtons from '@components/QuickActionButtons'

const TaskPostponeActions = ({
  disabled = false,
  onPostpone,
  onSelectDate,
}) => (
  <div role="group" aria-label="Перенести задачу" className="mt-2">
    <div className="card-muted text-xs">Перенести на</div>
    <QuickActionButtons
      wrapperClassName="mt-1"
      buttonClassName="min-h-10 rounded"
      actions={[
        {
          key: 'tomorrow',
          label: 'Завтра',
          disabled,
          onClick: () => onPostpone(1),
        },
        {
          key: 'day-after-tomorrow',
          label: 'Послезавтра',
          disabled,
          onClick: () => onPostpone(2),
        },
        {
          key: 'select-date',
          label: 'Выбрать дату',
          disabled,
          onClick: onSelectDate,
        },
      ]}
    />
  </div>
)

export default TaskPostponeActions
