import {
  sanitizeProposalRichText,
  getProposalBlockContentHtml,
  PROPOSAL_VARIABLE_OPTIONS,
} from '../../../../../helpers/proposalRichText.js'
import { escapeProposalHtml } from '../../../../../helpers/proposalRichText.js'
const config = window.__VEDELO_LOCAL__
const post = (value) => {
  const message = JSON.stringify({ key: config.key || '', ...value })
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(message)
  else window.parent.postMessage(message, '*')
}
const container = document.getElementById('root')
container.innerHTML =
  '<div class="toolbar" role="toolbar" aria-label="Форматирование"></div><div class="proposal-rich-text-content" contenteditable="true" role="textbox" aria-label="Текст блока" spellcheck="true"></div>'
const toolbar = container.firstElementChild,
  editor = container.lastElementChild
// Browser execCommand emits b/i/strike; persist canonical tags accepted by the
// original sanitizer. No tags, attributes or sources are added to its allowlist.
const canonicalTags = { b: 'strong', i: 'em', strike: 's' }
const clean = (value) =>
  sanitizeProposalRichText(
    String(value ?? '').replace(
      /(<\/?)(b|i|strike)(?=[\s>])/gi,
      (_, prefix, tag) => prefix + canonicalTags[tag.toLowerCase()]
    )
  ) || '<p></p>'
// Loading the visual editor must not rewrite a stored legacy or rich block.
editor.contentEditable = String(config.editable !== false)
editor.innerHTML = clean(
  config.value ?? getProposalBlockContentHtml(config.block)
)
const emit = () => post({ type: 'change', html: clean(editor.innerHTML) })
const exec = (command, value) => {
  if (editor.contentEditable === 'false') return
  editor.focus()
  document.execCommand(command, false, value)
  emit()
}
for (const [title, command, value] of [
  ['Жирный', 'bold'],
  ['Курсив', 'italic'],
  ['Зачёркнутый', 'strikeThrough'],
  ['Заголовок 2', 'formatBlock', 'h2'],
  ['Заголовок 3', 'formatBlock', 'h3'],
  ['Текст', 'formatBlock', 'p'],
  ['Список', 'insertUnorderedList'],
  ['Нумерация', 'insertOrderedList'],
  ['Цитата', 'formatBlock', 'blockquote'],
  ['Отменить', 'undo'],
  ['Повторить', 'redo'],
]) {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = title
  button.onmousedown = (e) => e.preventDefault()
  button.onclick = () => exec(command, value)
  toolbar.appendChild(button)
}
const linkButton = document.createElement('button')
linkButton.type = 'button'
linkButton.textContent = 'Ссылка'
linkButton.onmousedown = (e) => e.preventDefault()
linkButton.onclick = () => {
  const url = window.prompt('Адрес ссылки https://')
  if (!url) return
  try {
    if (!['http:', 'https:'].includes(new URL(url).protocol)) return
    exec('createLink', url)
  } catch {}
}
toolbar.appendChild(linkButton)
const variables = document.createElement('select')
variables.setAttribute('aria-label', 'Вставить переменную')
variables.innerHTML =
  '<option value="">Переменная…</option>' +
  PROPOSAL_VARIABLE_OPTIONS.map(
    (item) => `<option value="${item.key}">${item.label}</option>`
  ).join('')
variables.onchange = () => {
  if (variables.value) exec('insertText', `{{${variables.value}}}`)
  variables.value = ''
}
toolbar.appendChild(variables)
editor.addEventListener('input', () => {
  if (editor.innerHTML.length > 30000)
    editor.innerHTML = clean(editor.innerHTML)
  emit()
})
editor.addEventListener('paste', (event) => {
  event.preventDefault()
  const html = event.clipboardData.getData('text/html')
  exec(
    'insertHTML',
    html
      ? clean(html)
      : `<p>${escapeProposalHtml(event.clipboardData.getData('text/plain'))}</p>`
  )
})
editor.addEventListener('drop', (event) => event.preventDefault())
document.addEventListener('click', (event) => {
  if (event.target.closest('a')) event.preventDefault()
})
window.vedeloEditor = (command) => {
  if (command.type === 'setEditable' && typeof command.editable === 'boolean') {
    editor.contentEditable = String(command.editable)
    toolbar.querySelectorAll('button,select').forEach((control) => {
      control.disabled = !command.editable
    })
    return
  }
  if (command.type === 'setContent' && typeof command.html === 'string') {
    editor.innerHTML = clean(command.html)
    return
  }
  if (
    command.type !== 'insertMedia' ||
    !['image', 'video'].includes(command.kind)
  )
    return
  try {
    if (!['http:', 'https:'].includes(new URL(command.url).protocol)) return
  } catch {
    return
  }
  const node = document.createElement(
    command.kind === 'image' ? 'img' : 'video'
  )
  node.src = command.url
  if (command.kind === 'image') node.alt = String(command.title || '')
  else {
    node.controls = true
    node.setAttribute('playsinline', '')
    node.preload = 'metadata'
  }
  exec('insertHTML', clean(node.outerHTML))
}
window.vedeloEditor({
  type: 'setEditable',
  editable: config.editable !== false,
})
post({ type: 'ready' })
window.addEventListener('message', (event) => {
  if (
    event.source === window.parent &&
    event.data?.key === config.key &&
    event.data?.command
  )
    window.vedeloEditor(event.data.command)
})
