'use client'

import fieldHelp from '@helpers/fieldHelp.json'
import FieldHelp from '@components/FieldHelp'

import { useState } from 'react'
import { useAtomValue } from 'jotai'
import { useQueryClient } from '@tanstack/react-query'
import { modalsFuncAtom } from '@state/atoms'
import { faTrashAlt } from '@fortawesome/free-regular-svg-icons'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'
import { faCircleCheck } from '@fortawesome/free-solid-svg-icons/faCircleCheck'
import AppButton from '@components/AppButton'
import IconActionButton from '@components/IconActionButton'
import IconCheckBox from '@components/IconCheckBox'
import Input from '@components/Input'
import Notice from '@components/Notice'
import ProposalLineDialog from '@components/ProposalLineDialog'
import Textarea from '@components/Textarea'
import selectEventServicesFunc from '@layouts/modals/modalsFunc/selectEventServicesFunc'
import { formatMoney } from '@helpers/formatMoney'
import { queryKeys } from '@helpers/queryKeys'
import {
  calculatePackageTotal,
  reconcileProposalServices,
} from '@helpers/proposalWorkflow'

export const PROPOSAL_PACKAGE_LINES_LIMIT = 30

// Поля одного варианта; изменения остаются локальными в ProposalPackageDialog.
const ProposalPackageForm = ({
  value,
  onChange,
  services = [],
  servicesLoading = false,
  servicesError = false,
  busy = false,
}) => {
  const item = value
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const queryClient = useQueryClient()
  const [message, setMessage] = useState(null)

  const updatePackage = (patch) =>
    onChange({
      ...item,
      ...patch,
      ...((patch.lines && !item.manualTotal) || patch.manualTotal === false
        ? { total: calculatePackageTotal(patch.lines || item.lines) }
        : {}),
    })
  const updateLine = (lineIndex, patch) =>
    updatePackage({
      lines: item.lines.map((line, index) =>
        index === lineIndex ? { ...line, ...patch } : line
      ),
    })

  const openLineEditor = (lineIndex = null) => {
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
            updatePackage({ lines: [...item.lines, line] })
          } else {
            updateLine(lineIndex, line)
          }
        },
      },
    })
  }

  const removeLine = (lineIndex) => {
    const line = item.lines[lineIndex]
    modalsFunc.add({
      title: 'Удалить позицию из КП?',
      declineButtonBgClassName: 'bg-general',
      text: `Позиция «${line.title || 'Без названия'}» будет удалена из варианта.`,
      confirmButtonName: 'Удалить',
      closeButtonName: 'Отмена',
      declineButtonName: 'Отмена',
      onConfirm: () =>
        updatePackage({
          lines: item.lines.filter((_, index) => index !== lineIndex),
        }),
    })
  }

  const chooseServices = () => {
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
          updatePackage({ lines })
        },
        { services }
      )
    )
  }

  return (
    <div className="proposal-package-form space-y-3">
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
      <div className="input-label mb-1 flex items-center gap-1 px-1 text-xs font-semibold">
        Название варианта
        <FieldHelp
          label="Название варианта"
          text="Вариант — отдельный набор услуг и цены, который клиент сможет выбрать на странице предложения."
        />
      </div>
      <div className="flex items-center gap-2">
        <Input
          inputClassName="min-w-0"
          ariaLabel="Название варианта"
          noMargin
          fullWidth
          className="min-w-0 flex-1"
          value={item.title}
          onChange={(title) => updatePackage({ title })}
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={Boolean(item.recommended)}
          aria-label="Рекомендуем"
          className="focus-visible:outline-general cursor-pointer rounded focus-visible:outline-2"
          onClick={() => updatePackage({ recommended: !item.recommended })}
        >
          <IconCheckBox
            checked={Boolean(item.recommended)}
            label="Рекомендуем"
            checkedIcon={faCircleCheck}
            checkedIconColor="#F97316"
            noMargin
          />
        </button>
        <FieldHelp
          text={fieldHelp['proposal.recommended']}
          label="Рекомендуем"
        />
      </div>
      <Textarea
        label="Описание варианта"
        rows={2}
        value={item.description || ''}
        onChange={(description) => updatePackage({ description })}
      />
      <div className="input-label mt-2 flex items-center gap-1 px-1 text-xs font-semibold select-none">
        Список услуг варианта
        <FieldHelp
          text="Если в варианте одна услуга, клиент увидит название варианта и итоговую стоимость — без повторения названия и цены услуги."
          label="Список услуг варианта"
        />
      </div>
      <div className="mt-1 space-y-2">
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
                onClick={() => openLineEditor(lineIndex)}
              />
              <IconActionButton
                icon={faTrashAlt}
                variant="danger"
                size="sm"
                title={`Удалить позицию ${lineIndex + 1}`}
                onClick={() => removeLine(lineIndex)}
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
          onClick={() => chooseServices()}
        >
          Выбрать услуги
        </AppButton>
        <AppButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy || item.lines.length >= PROPOSAL_PACKAGE_LINES_LIMIT}
          onClick={() => openLineEditor()}
        >
          Своя позиция
        </AppButton>
        <Input
          inputClassName="min-w-0"
          label="Итого"
          ariaLabel="Итого"
          help="По умолчанию итог равен сумме позиций. Включите ручную цену, чтобы задать общую стоимость варианта, например со скидкой. Цены отдельных позиций при этом сохранятся."
          type="number"
          min={0}
          step={1000}
          decimalScale={2}
          postfix="₽"
          noMargin
          value={item.total}
          disabled={!item.manualTotal}
          onChange={(total) => updatePackage({ total })}
        />
      </div>
      <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(item.manualTotal)}
          onChange={(event) =>
            updatePackage({
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
    </div>
  )
}

export default ProposalPackageForm
