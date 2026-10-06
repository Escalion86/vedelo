'use client'

import { useState } from 'react'
import { useAtomValue } from 'jotai'
import { useQueryClient } from '@tanstack/react-query'
import { modalsFuncAtom } from '@state/atoms'
import { faTrashAlt } from '@fortawesome/free-regular-svg-icons'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'
import { faCircleCheck } from '@fortawesome/free-solid-svg-icons/faCircleCheck'
import AddIconButton from '@components/AddIconButton'
import AppButton from '@components/AppButton'
import IconActionButton from '@components/IconActionButton'
import IconCheckBox from '@components/IconCheckBox'
import Input from '@components/Input'
import Notice from '@components/Notice'
import ProposalLineDialog from '@components/ProposalLineDialog'
import Section from '@components/CompactEventSection'
import Textarea from '@components/Textarea'
import selectEventServicesFunc from '@layouts/modals/modalsFunc/selectEventServicesFunc'
import { formatMoney } from '@helpers/formatMoney'
import { queryKeys } from '@helpers/queryKeys'
import {
  calculatePackageTotal,
  reconcileProposalServices,
} from '@helpers/proposalWorkflow'

export const PROPOSAL_PACKAGES_LIMIT = 6
export const PROPOSAL_PACKAGE_LINES_LIMIT = 30

// Общий редактор вариантов («Что предлагаем клиенту») для КП и шаблона
// предложения: варианты с позициями, описанием, отметкой «Рекомендуем»
// и ручной итоговой ценой.
const ProposalPackagesEditor = ({
  packages = [],
  onChange,
  services = [],
  servicesLoading = false,
  servicesError = false,
  busy = false,
  initiallyOpenIds = null,
  hint = 'Выберите услуги из каталога или добавьте свои позиции. Несколько вариантов нужны, если хотите дать клиенту выбор.',
}) => {
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const queryClient = useQueryClient()
  const [message, setMessage] = useState(null)
  const [openedWhileEditing] = useState(() => new Set())

  const updatePackage = (packageIndex, patch) =>
    onChange(
      packages.map((item, index) =>
        index === packageIndex
          ? {
              ...item,
              ...patch,
              ...((patch.lines && !item.manualTotal) ||
              patch.manualTotal === false
                ? { total: calculatePackageTotal(patch.lines || item.lines) }
                : {}),
            }
          : item
      )
    )

  const updateLine = (packageIndex, lineIndex, patch) =>
    onChange(
      packages.map((item, index) =>
        index === packageIndex
          ? {
              ...item,
              lines: item.lines.map((line, currentLineIndex) =>
                currentLineIndex === lineIndex ? { ...line, ...patch } : line
              ),
              total: item.manualTotal
                ? item.total
                : calculatePackageTotal(
                    item.lines.map((line, currentLineIndex) =>
                      currentLineIndex === lineIndex
                        ? { ...line, ...patch }
                        : line
                    )
                  ),
            }
          : item
      )
    )

  const openLineEditor = (packageIndex, lineIndex = null) => {
    const item = packages[packageIndex]
    modalsFunc.add({
      title:
        lineIndex === null
          ? 'Добавление услуги в КП'
          : 'Редактирование услуги в КП',
      confirmButtonName: lineIndex === null ? 'Добавить' : 'Применить',
      declineButtonBgClassName: 'bg-general',
      closeButtonName: 'Отмена',
      declineButtonName: 'Отмена',
      Children: ProposalLineDialog,
      childrenProps: {
        initialLine:
          lineIndex === null
            ? { serviceId: '', title: '', description: '', price: 0 }
            : item.lines[lineIndex],
        index: lineIndex ?? item.lines.length,
        services,
        onApply: (line) => {
          if (lineIndex === null) {
            updatePackage(packageIndex, { lines: [...item.lines, line] })
          } else {
            updateLine(packageIndex, lineIndex, line)
          }
        },
      },
    })
  }

  const removeLine = (packageIndex, lineIndex) => {
    const item = packages[packageIndex]
    const line = item.lines[lineIndex]
    modalsFunc.add({
      title: 'Удалить позицию из КП?',
      declineButtonBgClassName: 'bg-general',
      text: `Позиция «${line.title || 'Без названия'}» будет удалена из варианта.`,
      confirmButtonName: 'Удалить',
      closeButtonName: 'Отмена',
      declineButtonName: 'Отмена',
      onConfirm: () =>
        updatePackage(packageIndex, {
          lines: item.lines.filter((_, index) => index !== lineIndex),
        }),
    })
  }

  const chooseServices = (packageIndex) => {
    const item = packages[packageIndex]
    setMessage(null)
    modalsFunc.add(
      selectEventServicesFunc(
        item.lines.map((line) => line.serviceId).filter(Boolean),
        (ids) => {
          const catalog =
            queryClient.getQueryData(queryKeys.services()) || services || []
          const lines = reconcileProposalServices(item.lines, ids, catalog)
          if (lines.length > PROPOSAL_PACKAGE_LINES_LIMIT) {
            setMessage({
              tone: 'warning',
              text: `В варианте может быть до ${PROPOSAL_PACKAGE_LINES_LIMIT} позиций. Выберите меньше услуг.`,
            })
            return
          }
          setMessage(null)
          updatePackage(packageIndex, { lines })
        },
        { services }
      )
    )
  }

  const addPackage = () => {
    if (packages.length >= PROPOSAL_PACKAGES_LIMIT) return
    const source = packages[0]
    const nextId = `package-${Date.now()}`
    openedWhileEditing.add(nextId)
    onChange([
      ...packages,
      {
        id: nextId,
        title: `Вариант ${packages.length + 1}`,
        description: '',
        lines: source?.lines?.map((line) => ({ ...line })) || [],
        total: source?.total || 0,
        manualTotal: source?.manualTotal ?? false,
        recommended: false,
      },
    ])
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
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {packages.map((item, packageIndex) => (
        <div
          key={item.id}
          className="proposal-package rounded-lg border border-gray-200 px-3"
        >
          <Section
            title={item.title || `Вариант ${packageIndex + 1}`}
            summary={`${formatMoney(item.total)} · Позиций: ${item.lines.length}${item.recommended ? ' · Рекомендуем' : ''}`}
            initiallyOpen={
              packageIndex === 0 ||
              openedWhileEditing.has(item.id) ||
              (Array.isArray(initiallyOpenIds)
                ? !initiallyOpenIds.includes(item.id)
                : false)
            }
            noDivider
            wrapSummary
          >
            <div className="flex flex-wrap items-center gap-2">
              <Input
                inputClassName="min-w-0"
                label="Название варианта"
                help="Вариант — отдельный набор услуг и цены, который клиент сможет выбрать на странице предложения."
                noMargin
                fullWidth
                className="min-w-0 flex-1"
                value={item.title}
                onChange={(title) => updatePackage(packageIndex, { title })}
              />
              <button
                type="button"
                role="checkbox"
                aria-checked={Boolean(item.recommended)}
                aria-label="Рекомендуем"
                className="focus-visible:outline-general cursor-pointer rounded focus-visible:outline-2"
                onClick={() =>
                  onChange(
                    packages.map((candidate, index) => ({
                      ...candidate,
                      recommended:
                        index === packageIndex ? !candidate.recommended : false,
                    }))
                  )
                }
              >
                <IconCheckBox
                  checked={Boolean(item.recommended)}
                  label="Рекомендуем"
                  checkedIcon={faCircleCheck}
                  checkedIconColor="#F97316"
                  noMargin
                />
              </button>
            </div>
            {packages.length > 1 ? (
              <IconActionButton
                icon={faTrashAlt}
                title="Удалить вариант"
                variant="danger"
                size="sm"
                onClick={() =>
                  onChange(
                    packages.filter((_, index) => index !== packageIndex)
                  )
                }
              />
            ) : null}
            <Textarea
              label="Описание варианта"
              rows={2}
              value={item.description || ''}
              onChange={(description) =>
                updatePackage(packageIndex, { description })
              }
            />
            <div className="mt-2 space-y-2">
              {item.lines.map((line, lineIndex) => (
                <div
                  key={lineIndex}
                  className="proposal-line-card flex items-start gap-2 rounded-lg border border-[var(--surface-card-border)] p-3 [background:var(--surface-card-bg)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium break-words">
                      {line.title || 'Без названия'}
                    </div>
                    {line.description ? (
                      <p className="mt-1 line-clamp-2 text-sm break-words text-gray-600">
                        {line.description}
                      </p>
                    ) : null}
                    <div className="mt-2 text-sm font-semibold">
                      {formatMoney(line.price)}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <IconActionButton
                      icon={faPencilAlt}
                      variant="warning"
                      size="sm"
                      title={`Редактировать позицию ${lineIndex + 1}`}
                      onClick={() => openLineEditor(packageIndex, lineIndex)}
                    />
                    <IconActionButton
                      icon={faTrashAlt}
                      variant="danger"
                      size="sm"
                      title={`Удалить позицию ${lineIndex + 1}`}
                      onClick={() => removeLine(packageIndex, lineIndex)}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <AppButton
                variant="primary"
                size="sm"
                disabled={busy || servicesLoading || servicesError}
                onClick={() => chooseServices(packageIndex)}
              >
                Выбрать услуги
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                disabled={item.lines.length >= PROPOSAL_PACKAGE_LINES_LIMIT}
                onClick={() => openLineEditor(packageIndex)}
              >
                Своя позиция
              </AppButton>
              <Input
                inputClassName="min-w-0"
                label="Итого"
                help="По умолчанию итог равен сумме позиций. Включите ручную цену, чтобы задать общую стоимость варианта, например со скидкой. Цены отдельных позиций при этом сохранятся."
                type="number"
                min={0}
                step={1000}
                decimalScale={2}
                postfix="₽"
                noMargin
                value={item.total}
                disabled={!item.manualTotal}
                onChange={(total) => updatePackage(packageIndex, { total })}
              />
            </div>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(item.manualTotal)}
                onChange={(event) =>
                  updatePackage(packageIndex, {
                    manualTotal: event.target.checked,
                  })
                }
              />
              Указать итоговую цену вручную
            </label>
            {item.manualTotal ? (
              <div className="mt-1 text-xs text-gray-600">
                Сумма позиций: {formatMoney(calculatePackageTotal(item.lines))}.
                Разница с итогом:{' '}
                {formatMoney(item.total - calculatePackageTotal(item.lines))}.
              </div>
            ) : null}
          </Section>
        </div>
      ))}
      <div className="flex justify-end">
        <AddIconButton
          title="Добавить вариант"
          label="Добавить вариант"
          size="sm"
          className="px-3"
          disabled={packages.length >= PROPOSAL_PACKAGES_LIMIT}
          onClick={addPackage}
        />
      </div>
    </div>
  )
}

export default ProposalPackagesEditor
