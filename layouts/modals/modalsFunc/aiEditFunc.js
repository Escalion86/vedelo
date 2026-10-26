import dynamic from 'next/dynamic'

const AiEditAssistant = dynamic(() => import('@components/AiEditAssistant'))

export default function aiEditFunc(eventId, mode, terms, options = {}) {
  return {
    title: options.unified ? `Создать / редактировать ${terms.accusative}` : `Редактировать ${terms.accusative} с ИИ`,
    Children: AiEditAssistant,
    frameless: mode === 'voice',
    childrenProps: { eventId, mode, unified: Boolean(options.unified), standaloneVoice: mode === 'voice' },
    onlyCloseButtonShow: true,
    crossActsAsDecline: false,
    closeButtonName: 'Закрыть',
  }
}
