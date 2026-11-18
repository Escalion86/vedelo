import {
  formatQuestionnaireDay,
  formatTelegramQuestionnairePrompt,
  parseQuestionnaireDay,
} from './telegramQuestionnaireSteps.mjs'
import {
  getVisibleTelegramQuestionnaireBlocks,
  telegramQuestionnaireMediaKey,
} from '../helpers/telegramQuestionnaireBlocks.mjs'

const ask = ['Задать вопрос', 'ask']
const textLimit = 800

export function snapshotQuestionnaireBlocks(config) {
  const blocks = config.blocks ?? []
  const mediaIds = new Set(blocks.flatMap(block => block.mediaIds ?? []))
  return {
    schemaVersion: 2,
    blocks,
    scenarioMedia: (config.media ?? []).filter(item => mediaIds.has(telegramQuestionnaireMediaKey(item))),
    welcomeText: config.useTelegramGreeting === true
      ? 'Чем могу помочь?'
      : config.welcomeText || 'Здравствуйте! Чем могу помочь?',
  }
}

export function resolveQuestionnaireBlocks(blocks, entries = []) {
  const input = new Map(entries.map(answer => [answer.blockId, answer]))
  const visible = getVisibleTelegramQuestionnaireBlocks(blocks, Object.fromEntries(input))
  const answers = new Map(visible.filter(block => input.has(block.id)).map(block => [block.id, input.get(block.id)]))
  return { visible, answers }
}

const nextBlock = (session, entries) => {
  const { visible, answers } = resolveQuestionnaireBlocks(session.blocks, entries)
  const pending = visible.find(block => !answers.has(block.id))
  return {
    step: pending ? 'block' : 'review',
    blockId: pending?.id ?? '', blockInput: '', aiQuestion: '', aiOperation: '',
    aiClarifications: [], aiEditQuestions: [], aiEditing: false,
    blockAnswers: [...answers.values()],
  }
}

export const activeQuestionnaireBlock = (session) => session.blocks?.find(block => block.id === session.blockId)

export function questionnaireBlockMedia(session, block) {
  const ids = new Set(block?.mediaIds ?? [])
  return (session.scenarioMedia ?? []).filter(item => ids.has(telegramQuestionnaireMediaKey(item)))
}

export function completeQuestionnaireBlock(session, answer = {}) {
  const previous = (session.blockAnswers ?? []).filter(entry => entry.blockId !== session.blockId)
  return nextBlock(session, [...previous, { blockId: session.blockId, ...answer }])
}

export function completeQuestionnaireAiBlock(session, clarifications = session.aiClarifications ?? []) {
  return completeQuestionnaireBlock(session, clarifications.length ? {
    value: clarifications.map(({ answer }) => answer).join('\n'), clarifications,
  } : {})
}

const questionLabel = (block) => block.label || block.text || 'Уточнение'

const formatAnswer = (answer) => answer.date
  ? [formatQuestionnaireDay(answer.date), answer.time].filter(Boolean).join(' в ')
  : answer.value

function parseLocation(value) {
  const separator = value.indexOf(',')
  const city = separator === -1 ? value : value.slice(0, separator).trim()
  const venue = separator === -1 ? '' : value.slice(separator + 1).trim()
  return { city: city.slice(0, 120), venue: venue.slice(0, 250) }
}

export function readQuestionnaireResult(session) {
  const { visible, answers } = resolveQuestionnaireBlocks(session.blocks, session.blockAnswers)
  const summary = []
  const comments = []
  const serviceIds = []
  const result = { eventType: '', date: '', time: '', city: '', venue: '', services: [], description: '' }
  for (const block of visible) {
    const answer = answers.get(block.id)
    if (!answer?.value) continue
    if (block.type === 'ai' && answer.clarifications?.length) {
      const lines = answer.clarifications.map(item => `${item.question}: ${item.answer}`)
      summary.push(...lines)
      comments.push(...lines)
      continue
    }
    summary.push(`${questionLabel(block)}: ${formatAnswer(answer)}`)
    switch (block.type) {
      case 'eventType':
        if (!result.eventType) result.eventType = answer.value
        break
      case 'dateTime':
        if (!result.date) { result.date = answer.date; result.time = answer.time || '' }
        break
      case 'location':
        if (!result.city) Object.assign(result, parseLocation(answer.value))
        break
      case 'services':
        result.services.push(answer.value)
        if (answer.serviceId) serviceIds.push(answer.serviceId)
        break
      default:
        comments.push(`${questionLabel(block)}: ${answer.value}`)
    }
  }
  if (result.services.length) comments.unshift(`Услуги: ${result.services.join(', ')}`)
  if (result.date && !result.time) comments.unshift(`Дата: ${formatQuestionnaireDay(result.date)}. Время не указано.`)
  result.description = comments.join('\n')
  return { result, serviceIds: [...new Set(serviceIds)], summary }
}

const editableBlocks = (session) => {
  const { visible, answers } = resolveQuestionnaireBlocks(session.blocks, session.blockAnswers)
  return visible.filter(block => block.type !== 'message' && (block.type !== 'ai' || answers.get(block.id)?.clarifications?.length))
}

const renderReview = (session) => {
  const { summary } = readQuestionnaireResult(session)
  const text = ['Проверьте заявку', ...summary].join('\n')
  return formatTelegramQuestionnairePrompt(session,
    text.length > 3950 ? `${text.slice(0, 3900)}\n…\nПроверьте отдельные ответы через «Изменить ответы».` : text,
    [['Отправить заявку', 'submit'], ['Изменить ответы', 'edit'], ['Отменить', 'cancel'], ask])
}

const canUseCustomOption = (block) => ['eventType', 'location', 'question'].includes(block.type)

export function buildQuestionnaireBlockPrompt(session) {
  if (session.step === 'review') return renderReview(session)
  if (session.step === 'editBlocks') {
    const choices = editableBlocks(session).map((block, index) => [questionLabel(block).slice(0, 70), `edit${index}`])
    return formatTelegramQuestionnairePrompt(session, 'Какой ответ изменить?', [...choices, ['Назад', 'back'], ask])
  }
  if (session.step !== 'block') return null
  const block = activeQuestionnaireBlock(session)
  if (!block || block.type === 'message' || (block.type === 'ai' && !session.aiQuestion)) return null
  const rows = []
  const options = block.options ?? []
  let text = block.type === 'ai' ? session.aiQuestion : block.text
  if (block.type === 'dateTime') text += '\nНапишите дату в формате ДД.ММ.ГГГГ, при необходимости добавьте время ЧЧ:ММ.'
  if (session.blockInput === 'custom') text = 'Напишите ваш вариант сообщением.'
  else if (options.length) {
    rows.push(...options.map((option, index) => [option.label, `opt${index}`]))
    if (canUseCustomOption(block)) rows.push(['Другой вариант', 'other'])
  }
  if (block.type === 'location' && (!options.length || session.blockInput === 'custom')) {
    text += '\nМожно указать город и площадку через запятую.'
  }
  if (!block.required) rows.push([block.type === 'dateTime' ? 'Пока не знаю' : 'Пропустить', 'skip'])
  rows.push(ask)
  return formatTelegramQuestionnairePrompt(session, text, rows)
}

export function getQuestionnaireBlockCallbackStep(session, action) {
  if (action === 'ask' && ['offer', 'block', 'review', 'editBlocks'].includes(session.step)) return { step: 'handedOff' }
  if (session.step === 'offer' && action === 'start') return nextBlock(session, [])
  if (session.step === 'review') {
    if (action === 'edit') return { step: 'editBlocks' }
    if (action === 'cancel') return { step: 'cancelled' }
    if (action === 'submit') return { step: 'submitting' }
    return null
  }
  if (session.step === 'editBlocks') {
    if (action === 'back') return { step: 'review' }
    const match = /^edit(\d{1,2})$/.exec(action)
    const selected = match ? editableBlocks(session)[Number(match[1])] : null
    if (!selected) return null
    const answer = (session.blockAnswers ?? []).find(entry => entry.blockId === selected.id)
    const [question = '', ...remaining] = answer?.clarifications?.map(item => item.question) ?? []
    return {
      step: 'block', blockId: selected.id, blockInput: '', aiQuestion: question, aiOperation: '',
      aiClarifications: [], aiEditQuestions: remaining, aiEditing: Boolean(question),
    }
  }
  const block = session.step === 'block' && activeQuestionnaireBlock(session)
  if (!block || block.type === 'message') return null
  if (action === 'skip' && !block.required) return block.type === 'ai'
    ? completeQuestionnaireAiBlock(session)
    : completeQuestionnaireBlock(session)
  const options = block.options ?? []
  if (action === 'other' && options.length && canUseCustomOption(block) && session.blockInput !== 'custom') {
    return { step: 'block', blockInput: 'custom' }
  }
  const optionMatch = /^opt(\d{1,2})$/.exec(action)
  const option = optionMatch && session.blockInput !== 'custom' ? options[Number(optionMatch[1])] : null
  if (!option) return null
  return completeQuestionnaireBlock(session, {
    value: option.label, optionId: option.id,
    ...(option.serviceId ? { serviceId: option.serviceId } : {}),
  })
}

export function getQuestionnaireBlockTextStep(session, textValue) {
  const block = session.step === 'block' && activeQuestionnaireBlock(session)
  const value = typeof textValue === 'string' ? textValue.trim() : ''
  if (!block || !value || block.type === 'message' || block.type === 'services') return null
  if (block.options?.length && session.blockInput !== 'custom') return null
  if (block.type === 'dateTime') {
    const match = /^(\d{1,2}\.\d{1,2}\.\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(value)
    const date = match && parseQuestionnaireDay(match[1])
    const hour = match?.[2]
    const minute = match?.[3]
    if (!date || (hour && (Number(hour) > 23 || Number(minute) > 59))) {
      return { error: 'Проверьте дату. Пример: 05.09.2027 или 05.09.2027 18:30.' }
    }
    const time = hour ? `${hour.padStart(2, '0')}:${minute}` : ''
    return completeQuestionnaireBlock(session, { value, date, time })
  }
  if (block.type === 'ai') {
    if (!session.aiQuestion) return null
    const clarifications = [...(session.aiClarifications ?? []), { question: session.aiQuestion, answer: value.slice(0, textLimit) }]
    if (!session.aiEditing) return { step: 'block', aiQuestion: '', aiOperation: '', aiClarifications: clarifications }
    const [question, ...remaining] = session.aiEditQuestions ?? []
    return question
      ? { step: 'block', aiQuestion: question, aiEditQuestions: remaining, aiClarifications: clarifications }
      : completeQuestionnaireAiBlock(session, clarifications)
  }
  if (block.type === 'location' && !parseLocation(value).city) return { error: 'Укажите город перед запятой.' }
  return completeQuestionnaireBlock(session, {
    value: value.slice(0, block.type === 'eventType' ? 120 : textLimit),
  })
}

export function buildQuestionnaireAiContext(session) {
  const { visible, answers } = resolveQuestionnaireBlocks(session.blocks, session.blockAnswers)
  const fields = []
  const previousClarifications = []
  for (const block of visible) {
    if (block.id === session.blockId) break
    const answer = answers.get(block.id)
    if (!answer?.value) continue
    if (block.type === 'ai') previousClarifications.push(...(answer.clarifications ?? []))
    else fields.push({ question: questionLabel(block), answer: formatAnswer(answer) })
  }
  previousClarifications.push(...(session.aiClarifications ?? []))
  return { initialMessage: session.initialMessage, answers: fields, previousClarifications }
}
