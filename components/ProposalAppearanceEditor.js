'use client'

import { useRef } from 'react'
import Image from 'next/image'
import ComboBox from '@components/ComboBox'
import AppButton from '@components/AppButton'
import IconActionButton from '@components/IconActionButton'
import { faTrashAlt } from '@fortawesome/free-regular-svg-icons'
import {
  PROPOSAL_THEMES,
  normalizeProposalAppearance,
} from '@helpers/proposalAppearance.mjs'

const logoLoader = ({ src }) => src

export default function ProposalAppearanceEditor({
  value,
  onChange,
  onUpload,
  busy,
}) {
  const fileInput = useRef(null)
  const appearance = normalizeProposalAppearance(value)
  return (
    <details className="proposal-appearance rounded-lg border border-gray-200 p-3">
      <summary className="cursor-pointer font-semibold">
        Оформление предложения
      </summary>
      <div className="mt-3 space-y-3">
        <ComboBox
          label="Тема оформления"
          noMargin
          fullWidth
          help="Оформление клиентской страницы и предпросмотра. Тема кабинета на него не влияет."
          value={appearance.theme}
          items={PROPOSAL_THEMES}
          disabled={busy}
          onChange={(theme) => onChange({ ...appearance, theme })}
        />
        <div className="flex flex-wrap items-center gap-3">
          {appearance.logoUrl ? (
            <Image
              src={appearance.logoUrl}
              alt="Логотип предложения"
              width={220}
              height={80}
              loader={logoLoader}
              unoptimized
              className="h-20 w-44 rounded border border-gray-200 bg-white object-contain p-2"
            />
          ) : null}
          <AppButton
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            {busy
              ? 'Подождите…'
              : appearance.logoUrl
                ? 'Заменить логотип'
                : 'Добавить логотип'}
          </AppButton>
          {appearance.logoUrl ? (
            <IconActionButton
              icon={faTrashAlt}
              variant="danger"
              size="sm"
              title="Убрать логотип из предложения"
              disabled={busy}
              onClick={() => onChange({ ...appearance, logoUrl: '' })}
            />
          ) : null}
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Файл логотипа"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) onUpload(file)
            }}
          />
        </div>
        <p className="text-xs text-gray-600">
          PNG, JPG или WebP до 5 МБ. Логотип появится в шапке предложения.
          Сохраните КП, чтобы применить оформление.
        </p>
      </div>
    </details>
  )
}
