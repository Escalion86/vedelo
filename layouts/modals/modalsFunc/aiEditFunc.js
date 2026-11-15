import dynamic from 'next/dynamic'

const AiEditAssistant = dynamic(() => import('@components/AiEditAssistant'))

export default function aiEditFunc(eventId, mode, terms, options = {}) {
  const { unified, initialClient } = options
  return {
    title: initialClient?._id
      ? `Создать ${terms.accusative} с ИИ`
      : unified ? `Создать / редактировать ${terms.accusative}` : `Редактировать ${terms.accusative} с ИИ`,
    Children: AiEditAssistant,
    frameless: mode === 'voice',
    childrenProps: { eventId, mode, unified: Boolean(unified), initialClient, standaloneVoice: mode === 'voice' },
    onlyCloseButtonShow: true,
    crossActsAsDecline: false,
    closeButtonName: 'Закрыть',
  }
}
