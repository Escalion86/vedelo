import dynamic from 'next/dynamic'

const AiEditAssistant = dynamic(() => import('@components/AiEditAssistant'))

export default function aiEditFunc(eventId, mode, terms) {
  return {
    title: `Редактировать ${terms.accusative} с ИИ`,
    Children: AiEditAssistant,
    childrenProps: { eventId, mode },
    onlyCloseButtonShow: true,
    crossActsAsDecline: false,
    closeButtonName: 'Закрыть',
  }
}
