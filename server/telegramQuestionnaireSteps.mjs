export const TELEGRAM_QUESTIONNAIRE_PREFIX = 'vq:'

export const questionnaireActiveSteps = [
  'offer', 'service', 'serviceText', 'date', 'city', 'cityText', 'details', 'review',
]

const DEFAULT_QUESTIONS = {
  service: 'Для какого мероприятия нужна услуга?',
  date: 'На какую дату планируете заказ?',
  city: 'В каком городе нужен заказ?',
  details: 'Что ещё важно знать о заказе?',
}

const cleanText = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : ''

export function snapshotTelegramQuestionnaire(config) {
  const questions = Object.fromEntries(Object.entries(DEFAULT_QUESTIONS).map(([key, fallback]) => {
    const question = config?.questions?.[key]
    const options = Array.isArray(question?.options)
      ? [...new Set(question.options.map(option => cleanText(option, 100)).filter(Boolean))].slice(0, 10)
      : []
    return [key, { text: cleanText(question?.text, 500) || fallback, options }]
  }))
  return {
    questions,
    welcomeText: config?.useTelegramGreeting === true
      ? 'Чем могу помочь?'
      : cleanText(config?.welcomeText, 1000) || 'Здравствуйте! Чем могу помочь?',
  }
}

const formatDay = (value) => value.split('-').reverse().join('.')

export function buildTelegramQuestionnairePrompt(session) {
  const { step, callbackToken, revision, questions, answers = {}, welcomeText } = session
  const keyboard = (rows) => ({
    inline_keyboard: rows.map(([text, action]) => [{
      text, callback_data: `${TELEGRAM_QUESTIONNAIRE_PREFIX}${callbackToken}:${revision}:${action}`,
    }]),
  })
  const format = (text, rows) => ({ text, ...(rows?.length ? { replyMarkup: keyboard(rows) } : {}) })
  const ask = ['Задать вопрос', 'ask']
  switch (step) {
    case 'offer':
      return format(welcomeText, [['Оставить заявку', 'start'], ask])
    case 'service':
    case 'city': {
      const { text, options } = questions[step]
      return format(options.length ? text : `${text}\nНапишите ответ сообщением.`, [
        ...options.map((option, index) => [option, `option${index}`]),
        ...(options.length ? [['Другое', 'other']] : []),
        ask,
      ])
    }
    case 'serviceText':
      return format('Напишите название услуги сообщением.', [ask])
    case 'cityText':
      return format('Напишите название города сообщением.', [ask])
    case 'date':
      return format(`${questions.date.text}\nНапишите дату в формате ДД.ММ.ГГГГ.`, [['Пока не знаю', 'skip'], ask])
    case 'details':
      return format(questions.details.text, [['Пропустить', 'skip'], ask])
    case 'review': {
      const summary = [
        'Проверьте заявку',
        `Услуга: ${answers.service}`,
        `Дата: ${answers.date ? formatDay(answers.date) : 'пока неизвестна'}`,
        `Город: ${answers.city}`,
        answers.details && `Комментарий: ${answers.details}`,
      ].filter(Boolean)
      return format(summary.join('\n'), [['Отправить заявку', 'submit'], ['Изменить ответы', 'edit'], ['Отменить', 'cancel'], ask])
    }
    case 'handedOff':
      return format('Вы выбрали «Задать вопрос». Напишите ваш вопрос, и мы ответим в этом чате.')
    case 'cancelled':
      return format('Заявка отменена. Вы можете написать нам в этом чате.')
    case 'completed':
      return format('Спасибо, заявка отправлена! Мы свяжемся с вами в этом чате.')
    case 'limit':
      return format('Сейчас не удалось принять заявку автоматически. Напишите нам в этом чате.')
    default:
      return null
  }
}

function parseQuestionnaireDay(text) {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text)
  if (!match) return null
  const [, day, month, year] = match
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  const date = new Date(`${iso}T12:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null
}

export function readTelegramQuestionnaireCallback(data) {
  const match = /^vq:([0-9a-f]{24}):(\d{1,4}):([a-z0-9]{1,12})$/.exec(data)
  return match ? { token: match[1], revision: Number(match[2]), action: match[3] } : null
}

export function getTelegramQuestionnaireCallbackStep(session, action) {
  const { step, questions } = session
  if (action === 'ask' && questionnaireActiveSteps.includes(step)) return { step: 'handedOff' }
  if (step === 'offer' && action === 'start') return { step: 'service' }
  if (step === 'date' && action === 'skip') return { step: 'city' }
  if (step === 'details' && action === 'skip') return { step: 'review' }
  if (step === 'review' && action === 'edit') return { step: 'service', resetAnswers: true }
  if (step === 'review' && action === 'cancel') return { step: 'cancelled' }
  if (step === 'review' && action === 'submit') return { step: 'submitting' }
  if (step !== 'service' && step !== 'city') return null
  if (action === 'other' && questions[step].options.length) return { step: `${step}Text` }
  const match = /^option(\d)$/.exec(action)
  const value = match ? questions[step].options[Number(match[1])] : null
  return value ? { step: step === 'service' ? 'date' : 'details', answer: { [step]: value } } : null
}

export function getTelegramQuestionnaireTextStep(session, rawText) {
  const text = typeof rawText === 'string' ? rawText.trim() : ''
  if (!text) return null
  const { step, questions } = session
  if (step === 'date') {
    const date = parseQuestionnaireDay(text)
    return date ? { step: 'city', answer: { date } } : { error: 'Напишите дату в формате ДД.ММ.ГГГГ или нажмите «Пока не знаю».' }
  }
  if (step === 'serviceText' || (step === 'service' && !questions.service.options.length)) {
    return { step: 'date', answer: { service: text.slice(0, 120) } }
  }
  if (step === 'cityText' || (step === 'city' && !questions.city.options.length)) {
    return { step: 'details', answer: { city: text.slice(0, 120) } }
  }
  if (step === 'details') return { step: 'review', answer: { details: text.slice(0, 1000) } }
  return null
}
