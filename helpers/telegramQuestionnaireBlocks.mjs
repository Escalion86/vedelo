export const telegramQuestionnaireBlockTypes = [
  'eventType', 'dateTime', 'location', 'services', 'question', 'message', 'ai',
]

export const telegramQuestionnaireMediaKey = ({ id, type, url }) => id || `${type}:${url}`

export const isTelegramQuestionnaireTestStart = (testRun, message) => {
  if (!testRun || String(message.text ?? '').trim().toLocaleLowerCase('ru') !== 'начать тест') return false
  const armedAt = new Date(testRun.armedAt).getTime()
  return Number.isFinite(armedAt) && Number.isFinite(message.date) && message.date * 1000 + 1000 > armedAt &&
    Number.isSafeInteger(message.message_id) && message.message_id > (testRun.armedAfterMessageId ?? 0)
}

export const isTelegramQuestionnaireBlockVisible = (block, answers) => {
  const condition = block.condition
  if (!condition) return true
  const answer = Object.hasOwn(answers, condition.blockId) ? answers[condition.blockId] : null
  if (!answer?.optionId && !answer?.value) return false
  return condition.operator === 'equals' ? answer.optionId === condition.optionId : answer.optionId !== condition.optionId
}

export const getVisibleTelegramQuestionnaireBlocks = (blocks, answers) => {
  const previousAnswers = Object.create(null)
  return blocks.filter((block) => {
    if (!isTelegramQuestionnaireBlockVisible(block, previousAnswers)) return false
    if (Object.hasOwn(answers, block.id)) previousAnswers[block.id] = answers[block.id]
    return true
  })
}
