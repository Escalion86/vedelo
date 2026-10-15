'use client'

import dynamic from 'next/dynamic'
import Input from '@components/Input'
import { getProposalBlockContentHtml } from '@helpers/proposalRichText'
import {
  hasProposalEditorSections,
  toProposalEditorBlocks,
} from '@helpers/proposalContent'

const RichTextEditor = dynamic(
  () => import('@components/ProposalRichTextEditor'),
  { ssr: false }
)

// Общий фиксированный порядок разделов для шаблона и предложения.
export default function ProposalContentEditor({
  blocks,
  onChange,
  directory,
  artist,
  appearanceEditor,
  mediaEditor,
  children,
}) {
  // Инициализация черновика уже нормализует снимок. При вводе не прогоняем
  // заново все неизменившиеся legacy-блоки через DOM-сенитайзер.
  const current = hasProposalEditorSections(blocks || [])
    ? blocks
    : toProposalEditorBlocks(blocks, artist)
  const update = (type, patch) =>
    onChange(
      current.map((block) =>
        block.type === type ? { ...block, ...patch } : block
      )
    )
  const editor = (type, label) => {
    const block = current.find((item) => item.type === type)
    return (
      <RichTextEditor
        value={getProposalBlockContentHtml(block)}
        onChange={(contentHtml) => update(type, { contentHtml })}
        placeholder={label}
        directory={directory}
      />
    )
  }
  const packages = current.find((block) => block.type === 'packages')
  return (
    <div className="proposal-content-editor min-w-0 space-y-5">
      <section className="min-w-0 space-y-3" aria-label="Шапка">
        <h3 className="font-semibold">Шапка</h3>
        {appearanceEditor}
        {editor('header', 'Текст шапки')}
      </section>
      <section className="min-w-0 space-y-3" aria-label="Варианты и цены">
        <h3 className="font-semibold">Варианты и цены</h3>
        {editor('packagesIntro', 'Вступление к вариантам')}
        {packages ? (
          <>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={packages.enabled !== false}
                onChange={(event) =>
                  update('packages', { enabled: event.target.checked })
                }
              />
              Показывать варианты клиенту
            </label>
            <Input
              label="Заголовок вариантов"
              value={packages.title || ''}
              onChange={(title) => update('packages', { title })}
              fullWidth
              noMargin
            />
          </>
        ) : null}
        {children}
      </section>
      <section className="min-w-0 space-y-3" aria-label="Условия и контакты">
        <h3 className="font-semibold">Условия и контакты</h3>
        {editor('closing', 'Условия и контакты')}
        {mediaEditor}
      </section>
    </div>
  )
}
