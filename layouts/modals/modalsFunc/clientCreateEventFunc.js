import AiBadge from '@components/AiBadge'
import AppButton from '@components/AppButton'
import useEventCreateMenu from '@helpers/useEventCreateMenu'

const ClientCreateEventModal = ({ client, closeModal }) => {
  const { items, draftModals } = useEventCreateMenu(client, closeModal)

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-2 py-2">
      {draftModals}
      {items.map((item, index) => (
        <AppButton
          key={item.key}
          variant="secondary"
          className="min-h-11 cursor-pointer justify-start gap-2"
          autoFocus={index === 0}
          onClick={item.onClick}
        >
          {item.icon}
          {item.label}
          {item.usesAi && <AiBadge />}
        </AppButton>
      ))}
    </div>
  )
}

const clientCreateEventFunc = (client, terms) => ({
  title: `Создать ${terms.accusative}`,
  Children: ClientCreateEventModal,
  childrenProps: { client },
  onlyCloseButtonShow: true,
  closeButtonName: 'Отмена',
})

export default clientCreateEventFunc
