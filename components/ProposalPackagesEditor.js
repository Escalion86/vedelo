'use client'

import { useEffect, useRef } from 'react'
import { useAtomValue } from 'jotai'
import { modalsFuncAtom } from '@state/atoms'
import { faTrashAlt } from '@fortawesome/free-regular-svg-icons'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'
import AddIconButton from '@components/AddIconButton'
import IconActionButton from '@components/IconActionButton'
import Notice from '@components/Notice'
import ProposalPackageDialog from '@components/ProposalPackageDialog'
import { formatMoney } from '@helpers/formatMoney'

export const PROPOSAL_PACKAGES_LIMIT = 6
export { PROPOSAL_PACKAGE_LINES_LIMIT } from '@components/ProposalPackageForm'

// Общие компактные карточки для КП и шаблонов. Поля редактируются в стеке модалок.
const ProposalPackagesEditor = ({
  packages = [],
  onChange,
  services = [],
  servicesLoading = false,
  servicesError = false,
  busy = false,
  hint = 'Выберите услуги из каталога или добавьте свои позиции. Несколько вариантов нужны, если хотите дать клиенту выбор.',
}) => {
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const latest = useRef({ packages, onChange })
  useEffect(() => {
    latest.current = { packages, onChange }
  }, [packages, onChange])

  const editPackage = (item = null) => {
    if (
      busy ||
      servicesLoading ||
      (!item && packages.length >= PROPOSAL_PACKAGES_LIMIT)
    )
      return
    modalsFunc.add({
      title: item ? 'Редактирование варианта КП' : 'Новый вариант КП',
      confirmButtonName: item ? 'Применить' : 'Добавить',
      closeButtonName: 'Отмена',
      declineButtonName: 'Отмена',
      Children: ProposalPackageDialog,
      childrenProps: {
        initialPackage: item || {
          id: crypto.randomUUID(),
          title: `Вариант ${packages.length + 1}`,
          description: '',
          lines: [],
          total: 0,
          manualTotal: false,
          recommended: false,
        },
        services,
        servicesLoading,
        servicesError,
        onApply: (next) => {
          const { packages: current, onChange: commit } = latest.current
          if (item && !current.some((candidate) => candidate.id === item.id))
            return
          if (!item && current.length >= PROPOSAL_PACKAGES_LIMIT) return
          const updated = item
            ? current.map((candidate) =>
                candidate.id === item.id ? next : candidate
              )
            : [...current, next]
          commit(
            updated.map((candidate) =>
              next.recommended && candidate.id !== next.id
                ? { ...candidate, recommended: false }
                : candidate
            )
          )
        },
      },
    })
  }

  const removePackage = (item) => {
    if (busy || packages.length <= 1) return
    modalsFunc.add({
      title: 'Удалить вариант КП?',
      text: `Вариант «${item.title || 'Без названия'}» будет удалён из предложения.`,
      confirmButtonName: 'Удалить',
      closeButtonName: 'Отмена',
      declineButtonName: 'Отмена',
      onConfirm: () => {
        const { packages: current, onChange: commit } = latest.current
        if (current.length > 1)
          commit(current.filter((candidate) => candidate.id !== item.id))
      },
    })
  }

  return (
    <div className="space-y-3">
      {hint ? <p className="text-xs text-gray-600">{hint}</p> : null}
      {servicesError ? (
        <Notice tone="warning">
          Не удалось загрузить каталог услуг. Можно заполнить свои позиции или
          повторно открыть редактор.
        </Notice>
      ) : null}
      {servicesLoading ? (
        <p className="text-xs text-gray-600">Загружаем каталог услуг…</p>
      ) : null}
      {packages.map((item, index) => (
        <div
          key={item.id}
          className="proposal-package ui-surface-card flex items-start gap-3 rounded-lg p-3"
        >
          <div className="min-w-0 flex-1">
            <p className="font-semibold break-words">
              {item.title || `Вариант ${index + 1}`}
            </p>
            <p className="mt-1 text-sm">
              {formatMoney(item.total)} · Позиций: {item.lines.length}
              {item.recommended ? ' · Рекомендуем' : ''}
            </p>
            {item.description ? (
              <p className="mt-1 line-clamp-2 text-sm break-words opacity-70">
                {item.description}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-1">
            <IconActionButton
              icon={faPencilAlt}
              variant="warning"
              size="sm"
              title={`Редактировать вариант ${index + 1}`}
              disabled={busy || servicesLoading}
              onClick={() => editPackage(item)}
            />
            {packages.length > 1 ? (
              <IconActionButton
                icon={faTrashAlt}
                variant="danger"
                size="sm"
                title={`Удалить вариант ${index + 1}`}
                disabled={busy}
                onClick={() => removePackage(item)}
              />
            ) : null}
          </div>
        </div>
      ))}
      <div className="flex justify-end">
        <AddIconButton
          title="Добавить вариант"
          label="Добавить вариант"
          size="sm"
          className="px-3"
          disabled={
            busy ||
            servicesLoading ||
            packages.length >= PROPOSAL_PACKAGES_LIMIT
          }
          onClick={() => editPackage()}
        />
      </div>
    </div>
  )
}

export default ProposalPackagesEditor
