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
      current.some((block) => block.type === type)
        ? current.map((block) =>
            block.type === type ? { ...block, ...patch } : block
          )
        : [
            ...current,
            { id: type, type, contentHtml: '', enabled: false, ...patch },
          ]
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
  const packages = current.find((block) => block.type === 'packages') || {
    enabled: false,
  }
  const description = (type, label) => {
    const block = current.find((item) => item.type === type)
    const enabled = Boolean(block && block.enabled !== false)
    return (
      <section className="min-w-0 space-y-3" aria-label={label}>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) =>
              update(type, { enabled: event.target.checked })
            }
          />
          Показывать {label.toLowerCase()}
        </label>
        {enabled ? (
          <>
            <h3 className="font-semibold">{label}</h3>
            {editor(type, label)}
          </>
        ) : null}
      </section>
    )
  }
  return (
    <div className="proposal-content-editor min-w-0 space-y-5">
      <section className="min-w-0 space-y-3" aria-label="Шапка">
        <h3 className="font-semibold">Шапка</h3>
        {appearanceEditor}
        {editor('header', 'Текст шапки')}
      </section>
      {description('packagesIntro', 'Описание под шапкой')}
      <section className="min-w-0 space-y-3" aria-label="Варианты и цены">
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
        {packages.enabled !== false ? (
          <>
            <h3 className="font-semibold">Варианты и цены</h3>
            <Input
              label="Заголовок вариантов"
              value={packages.title || ''}
              onChange={(title) => update('packages', { title })}
              fullWidth
              noMargin
            />
            {children}
          </>
        ) : null}
      </section>
      {description('packagesOutro', 'Описание после вариантов')}
      <section className="min-w-0 space-y-3" aria-label="Условия и контакты">
        <h3 className="font-semibold">Условия и контакты</h3>
        {editor('closing', 'Условия и контакты')}
        {mediaEditor}
      </section>
    </div>
  )
}
