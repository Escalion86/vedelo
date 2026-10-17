import ClientTypesEditor from '@components/ClientTypesEditor'

export default function clientTypesFunc(onAdded) {
  return {
    title: 'Список: Типы клиентов',
    Children: ClientTypesEditor,
    childrenProps: { onAdded },
    onlyCloseButtonShow: true,
    closeButtonName: 'Закрыть',
  }
}
