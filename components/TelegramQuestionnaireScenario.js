import { useState } from 'react'
import { faArrowDown } from '@fortawesome/free-solid-svg-icons/faArrowDown'
import { faArrowUp } from '@fortawesome/free-solid-svg-icons/faArrowUp'
import { faChevronRight } from '@fortawesome/free-solid-svg-icons/faChevronRight'
import { faTrashAlt } from '@fortawesome/free-solid-svg-icons/faTrashAlt'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import AppButton from '@components/AppButton'
import IconActionButton from '@components/IconActionButton'
import Input from '@components/Input'
import Notice from '@components/Notice'
import Select from '@components/Select'
import Textarea from '@components/Textarea'
import {
  getVisibleTelegramQuestionnaireBlocks,
  telegramQuestionnaireMediaKey,
} from '@helpers/telegramQuestionnaireBlocks.mjs'

const blockTypes = {
  eventType: { label: 'Тип заказа', text: 'Какой заказ вас интересует?', field: 'В заявку · Тип заказа', choices: true },
  dateTime: { label: 'Дата и время', text: 'На какую дату и время планируете заказ?', field: 'В заявку · Дата и время' },
  location: { label: 'Место', text: 'Где нужно выполнить заказ?', field: 'В заявку · Место', choices: true },
  services: { label: 'Услуги из каталога', text: 'Какая услуга вам нужна?', field: 'В заявку · Услуги', choices: true },
  question: { label: 'Свой вопрос', text: '', field: 'В комментарий', choices: true },
  message: { label: 'Сообщение или медиа', text: '', field: 'Отправка в Telegram' },
  ai: { label: 'Уточнение с ИИ', text: '', field: 'В комментарий' },
}

const operators = [
  { value: 'equals', label: 'Если выбран вариант' },
  { value: 'notEquals', label: 'Иначе' },
]

const maxBlocks = 24
const maxOptions = 8
const otherPreviewValue = '!other'
const canUseOther = (block) => block.options.length > 0 && ['eventType', 'location', 'question'].includes(block.type)
const hasAnswer = (type) => !['message', 'ai'].includes(type)
const newId = () => globalThis.crypto.randomUUID?.() || `block-${Date.now()}-${Math.random().toString(36).slice(2)}`
const blockTitle = (block) => block.label || blockTypes[block.type]?.label || block.type

const optionItems = (block) => (block?.options ?? []).map(({ id, label }) => ({ value: id, label }))

const conditionSources = (blocks, index) => blocks.slice(0, index).filter((block) => block.options?.length)

const validateOrder = (blocks) => blocks.every((block, index) =>
  !block.condition || conditionSources(blocks, index).some((item) => item.id === block.condition.blockId)
)

const movedBlocks = (blocks, index, direction) => {
  const target = index + direction
  if (!blocks[target]) return null
  const next = blocks.slice()
  next[target] = blocks[index]
  next[index] = blocks[target]
  return validateOrder(next) ? next : null
}

const blockConditionLabel = (block, blocks) => {
  if (!block.condition) return ''
  const source = blocks.find(({ id }) => id === block.condition.blockId)
  const option = source?.options.find(({ id }) => id === block.condition.optionId)
  if (!source || !option) return 'Уточните условие'
  return block.condition.operator === 'notEquals'
    ? `Иначе для «${option.label}» (${blockTitle(source)})`
    : `Если выбран «${option.label}» (${blockTitle(source)})`
}

const Check = ({ checked, disabled, onChange, children }) => (
  <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm has-[:disabled]:cursor-not-allowed">
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className="h-5 w-5 shrink-0 cursor-pointer accent-general focus-visible:outline-2 focus-visible:outline-offset-2"
    />
    <span className="min-w-0 break-words">{children}</span>
  </label>
)

const ChoiceEditor = ({ block, blocks, services, disabled, onChange }) => {
  const [service, setService] = useState('')
  const atLimit = block.options.length >= maxOptions
  const availableServices = services.filter(({ id }) => !block.options.some(({ serviceId }) => serviceId === id))

  const remove = (optionId) => onChange({ options: block.options.filter(({ id }) => id !== optionId) })
  const append = (option) => onChange({ options: [...block.options, { id: newId(), ...option }] })

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="text-sm font-medium">Варианты ответа</legend>
      {block.options.map((option, index) => {
        const inUse = blocks.some(({ condition }) => condition?.blockId === block.id && condition.optionId === option.id)
        return (
          <div key={option.id} className="flex min-w-0 items-end gap-2">
            <Input
              label={`Вариант ${index + 1}`}
              ariaLabel={`Вариант ${index + 1}`}
              value={option.label}
              maxLength={80}
              disabled={disabled}
              onChange={(label) => onChange({ options: block.options.map((item) => item.id === option.id ? { ...item, label } : item) })}
              noMargin
              fullWidth
            />
            <IconActionButton
              icon={faTrashAlt}
              variant="danger"
              title={inUse ? `Вариант ${index + 1} используется в условии` : `Удалить вариант ${index + 1}`}
              disabled={disabled || inUse}
              onClick={() => remove(option.id)}
            />
          </div>
        )
      })}
      {block.type === 'services' ? (
        <div className="flex flex-wrap items-end gap-2">
          <Select
            label="Услуга из каталога"
            aria-label="Услуга из каталога"
            value={service}
            onChange={setService}
            options={availableServices.map(({ id, name }) => ({ value: id, label: name }))}
            placeholder="Выберите услугу"
            disabled={disabled || atLimit || !availableServices.length}
            noMargin
          />
          <AppButton
            variant="secondary"
            size="sm"
            disabled={disabled || atLimit || !availableServices.some(({ id }) => id === service)}
            onClick={() => {
              const picked = availableServices.find(({ id }) => id === service)
              if (!picked) return
              append({ label: picked.name.slice(0, 80), serviceId: picked.id })
              setService('')
            }}
          >
            Добавить услугу
          </AppButton>
        </div>
      ) : (
        <AppButton
          className="self-start"
          variant="secondary"
          size="sm"
          disabled={disabled || atLimit}
          onClick={() => append({ label: '' })}
        >
          Добавить вариант
        </AppButton>
      )}
    </fieldset>
  )
}

const ConditionEditor = ({ block, sources, disabled, onChange }) => {
  const condition = block.condition
  const source = sources.find(({ id }) => id === condition?.blockId)
  if (!sources.length && !condition) return null

  return (
    <fieldset className="flex min-w-0 flex-col gap-2 rounded border border-gray-200 p-2">
      <legend className="px-1 text-sm font-medium">Условие показа</legend>
      <Select
        label="Вопрос для условия"
        aria-label="Вопрос для условия"
        value={source?.id ?? ''}
        options={sources.map((item) => ({ value: item.id, label: `${blockTitle(item)} · ${item.text.slice(0, 56)}` }))}
        placeholder="Показывать всегда"
        onChange={(blockId) => onChange({
          condition: { blockId, optionId: sources.find(({ id }) => id === blockId).options[0].id, operator: 'equals' },
        })}
        disabled={disabled || !sources.length}
        noMargin
        fullWidth
      />
      {condition ? (
        <>
          <div className="grid min-w-0 gap-2 tablet:grid-cols-2">
            <Select
              label="Правило"
              aria-label="Правило"
              value={condition.operator}
              options={operators}
              onChange={(operator) => onChange({ condition: { ...condition, operator } })}
              disabled={disabled}
              noMargin
              fullWidth
            />
            <Select
              label="Вариант для условия"
              aria-label="Вариант для условия"
              value={condition.optionId}
              options={optionItems(source)}
              onChange={(optionId) => onChange({ condition: { ...condition, optionId } })}
              disabled={disabled || !source}
              noMargin
              fullWidth
            />
          </div>
          {condition.operator === 'notEquals' ? <p className="text-xs text-gray-600">Блок откроется, если на вопрос выбрали другой ответ.</p> : null}
          <AppButton className="self-start" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange({ condition: undefined })}>
            Показывать всегда
          </AppButton>
        </>
      ) : null}
    </fieldset>
  )
}

const BlockEditor = ({ block, blocks, index, media, services, disabled, onChange }) => {
  const type = blockTypes[block.type]
  const selectedMedia = block.mediaIds ?? []
  return (
    <div className="flex min-w-0 flex-col gap-3 border-t border-gray-200 p-3">
      {block.type === 'question' ? (
        <Input
          label="Подпись в комментарии"
          ariaLabel="Подпись в комментарии"
          help="Если оставить поле пустым, подпись возьмётся из текста вопроса."
          value={block.label ?? ''}
          onChange={(label) => onChange({ label })}
          maxLength={80}
          disabled={disabled}
          noMargin
          fullWidth
        />
      ) : null}
      {block.type === 'ai' ? null : (
        <Textarea
          label={block.type === 'message' ? 'Текст сообщения' : 'Текст вопроса'}
          ariaLabel={`${type.label} — ${block.type === 'message' ? 'текст сообщения' : 'текст вопроса'}`}
          help={block.type === 'location' ? 'Клиент может указать город и площадку через запятую.' : undefined}
          value={block.text}
          onChange={(text) => onChange({ text })}
          maxLength={500}
          rows={2}
          disabled={disabled}
          noMargin
          fullWidth
        />
      )}
      {hasAnswer(block.type) ? (
        <Check checked={block.required} disabled={disabled} onChange={(required) => onChange({ required })}>
          Обязательный ответ
        </Check>
      ) : null}
      {type.choices ? <ChoiceEditor block={block} blocks={blocks} services={services} disabled={disabled} onChange={onChange} /> : null}
      {block.type === 'ai' ? (
        <Textarea
          label="Темы для уточнения"
          ariaLabel="Темы для уточнения"
          help="ИИ уточнит недостающие детали по этим темам. Ответы попадут в комментарий к заявке."
          value={block.topics ?? ''}
          onChange={(topics) => onChange({ topics })}
          maxLength={500}
          rows={3}
          disabled={disabled}
          noMargin
          fullWidth
        />
      ) : null}
      {block.type === 'message' ? (
        <fieldset className="min-w-0">
          <legend className="text-sm font-medium">Фото и видео для этого блока</legend>
          {media.length === 0 ? <p className="text-xs text-gray-600">Загрузите файлы в разделе «Файлы сценария» ниже.</p> : null}
          {media.map((item) => {
            const key = telegramQuestionnaireMediaKey(item)
            return (
              <Check
                key={key}
                checked={selectedMedia.includes(key)}
                disabled={disabled}
                onChange={(checked) => onChange({ mediaIds: checked ? [...selectedMedia, key] : selectedMedia.filter((id) => id !== key) })}
              >
                {item.name || item.url}
              </Check>
            )
          })}
        </fieldset>
      ) : null}
      <ConditionEditor block={block} sources={conditionSources(blocks, index)} disabled={disabled} onChange={onChange} />
    </div>
  )
}

export const getScenarioEditorError = (blocks) => {
  const invalid = blocks.find((block) =>
    (block.type !== 'ai' && !block.text.trim() && !(block.type === 'message' && block.mediaIds?.length)) ||
    (block.type === 'ai' && !block.topics?.trim()) ||
    (block.type === 'services' && !block.options.length) ||
    block.options.some(({ label }) => !label.trim())
  )
  if (invalid) return { id: invalid.id, text: `Заполните поля блока «${blockTitle(invalid)}».` }
  return null
}

export function TelegramQuestionnaireScenario({ blocks, media, services, openId, validationError, disabled, onOpen, onChange }) {
  const [newType, setNewType] = useState('')
  const [removeId, setRemoveId] = useState(null)
  const available = Object.entries(blockTypes)
    .map(([type, { label }]) => ({ value: type, label }))
  const atLimit = blocks.length >= maxBlocks
  const selectedType = available.some(({ value }) => value === newType) ? newType : ''

  const add = () => {
    if (!selectedType || atLimit) return
    const { text } = blockTypes[selectedType]
    const block = { id: newId(), type: selectedType, text, required: hasAnswer(selectedType), options: [] }
    onChange([...blocks, block])
    onOpen(block.id)
    setNewType('')
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-1 text-sm font-semibold">Блоки сценария</legend>
      <p className="text-xs leading-5 text-gray-600">Бот проходит блоки сверху вниз после нажатия «Оставить заявку». Затем он показывает сводку и предлагает отправить заявку.</p>
      {blocks.length ? (
        <ol className="flex min-w-0 flex-col gap-2">
          {blocks.map((block, index) => {
            const open = openId === block.id
            const up = movedBlocks(blocks, index, -1)
            const down = movedBlocks(blocks, index, 1)
            const inUse = blocks.some(({ condition }) => condition?.blockId === block.id)
            const title = blockTitle(block)
            return (
              <li key={block.id} className="min-w-0 rounded border border-gray-200">
                <div className="flex justify-between gap-1 p-1">
                  <AppButton
                    variant="ghost"
                    className="min-h-10 min-w-0 flex-1 justify-start gap-2 !px-2 text-left"
                    aria-expanded={open}
                    aria-controls={`telegram-block-${block.id}`}
                    onClick={() => onOpen(open ? null : block.id)}
                  >
                    <FontAwesomeIcon icon={faChevronRight} className={`h-3 w-3 shrink-0 ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
                    <span className="min-w-0 break-words">
                      <span className="block font-semibold">{title}</span>
                      <span className="block text-xs text-gray-600">{blockConditionLabel(block, blocks) || blockTypes[block.type].field}</span>
                    </span>
                  </AppButton>
                  <div className="flex shrink-0 self-start">
                    <IconActionButton variant="neutral" icon={faArrowUp} title={`Поднять блок «${title}»`} disabled={disabled || !up} onClick={() => onChange(up)} />
                    <IconActionButton variant="neutral" icon={faArrowDown} title={`Опустить блок «${title}»`} disabled={disabled || !down} onClick={() => onChange(down)} />
                    <IconActionButton
                      variant="danger"
                      icon={faTrashAlt}
                      title={inUse ? `Блок «${title}» используется в условии` : `Удалить блок «${title}»`}
                      disabled={disabled || inUse}
                      onClick={() => setRemoveId(block.id)}
                    />
                  </div>
                </div>
                {removeId === block.id ? (
                  <Notice tone="warning" className="m-2">
                    <p className="mb-2">Убрать блок «{title}» из сценария?</p>
                    <div className="flex flex-wrap gap-2">
                      <AppButton
                        variant="danger"
                        size="sm"
                        disabled={disabled}
                        onClick={() => {
                          onChange(blocks.filter(({ id }) => id !== block.id))
                          setRemoveId(null)
                        }}
                      >
                        Убрать блок
                      </AppButton>
                      <AppButton variant="secondary" size="sm" onClick={() => setRemoveId(null)}>Отмена</AppButton>
                    </div>
                  </Notice>
                ) : null}
                <div id={`telegram-block-${block.id}`} hidden={!open}>
                  {open ? (
                    <>
                      {validationError?.id === block.id ? <Notice tone="error" role="alert" className="m-2">{validationError.text}</Notice> : null}
                      <BlockEditor
                        block={block}
                        blocks={blocks}
                        index={index}
                        media={media}
                        services={services}
                        disabled={disabled}
                        onChange={(patch) => onChange(blocks.map((item) => item.id === block.id ? { ...item, ...patch } : item))}
                      />
                    </>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ol>
      ) : <Notice tone="neutral">Добавьте первый блок сценария.</Notice>}
      <div className="flex flex-wrap items-end gap-2">
        <Select
          label="Новый блок"
          aria-label="Новый блок"
          value={selectedType}
          placeholder="Выберите тип"
          options={available}
          disabled={disabled || atLimit}
          onChange={setNewType}
          noMargin
        />
        <AppButton variant="secondary" size="sm" disabled={disabled || atLimit || !selectedType} onClick={add}>
          Добавить блок
        </AppButton>
      </div>
    </fieldset>
  )
}

export function TelegramQuestionnairePreview({ questionnaire }) {
  const [selected, setSelected] = useState({})
  const answers = Object.fromEntries(questionnaire.blocks.flatMap((block) => {
    const answer = selected[block.id]
    if (answer === otherPreviewValue && canUseOther(block)) return [[block.id, { value: 'Другой вариант' }]]
    if (block.options.some(({ id }) => id === answer)) return [[block.id, { optionId: answer }]]
    return []
  }))
  const visible = getVisibleTelegramQuestionnaireBlocks(questionnaire.blocks, answers)
  const welcome = questionnaire.useTelegramGreeting
    ? 'Чем могу помочь?'
    : questionnaire.welcomeText.trim() || 'Здравствуйте! Чем могу помочь?'

  return (
    <section aria-label="Предпросмотр сценария" className="flex min-w-0 flex-col gap-2 rounded border border-gray-200 p-3">
      <p className="text-sm font-semibold">Предпросмотр сценария</p>
      <p className="text-xs text-gray-600">Выберите варианты ответов, чтобы увидеть, какие блоки покажет бот.</p>
      <ol className="flex min-w-0 flex-col gap-2 text-sm">
        <li className="rounded border border-gray-200 p-2">
          <p className="break-words whitespace-pre-wrap">{welcome}</p>
          <p className="text-xs text-gray-600">Кнопки «Оставить заявку» и «Задать вопрос»</p>
        </li>
        {visible.map((block) => (
          <li key={block.id} className="flex min-w-0 flex-col gap-2 rounded border border-gray-200 p-2">
            <p className="font-medium break-words">{blockTitle(block)}</p>
            {block.text ? <p className="break-words whitespace-pre-wrap">{block.text}</p> : null}
            {block.type === 'ai' ? <p className="break-words text-gray-600">ИИ уточнит детали по темам: {block.topics}</p> : null}
            {questionnaire.media
              .filter((item) => block.mediaIds?.includes(telegramQuestionnaireMediaKey(item)))
              .map((item) => (
                <p key={telegramQuestionnaireMediaKey(item)} className="text-xs break-all text-gray-600">{item.type === 'photo' ? 'Фото' : 'Видео'} · {item.name || item.url}</p>
              ))}
            {block.options.length ? (
              <Select
                label="Ответ клиента"
                aria-label={`${blockTitle(block)} — ответ клиента`}
                value={answers[block.id] ? selected[block.id] : ''}
                options={[
                  { value: '', label: 'Выберите ответ' },
                  ...optionItems(block),
                  ...(canUseOther(block) ? [{ value: otherPreviewValue, label: 'Другой вариант' }] : []),
                ]}
                onChange={(optionId) => setSelected((current) => ({ ...current, [block.id]: optionId }))}
                noMargin
                fullWidth
              />
            ) : null}
          </li>
        ))}
        <li className="rounded border border-gray-200 p-2">Проверка ответов и отправка заявки</li>
      </ol>
    </section>
  )
}
