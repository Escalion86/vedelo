'use client'

import { useMemo } from 'react'
import { useAtomValue } from 'jotai'
import MutedText from '@components/MutedText'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import { modalsFuncAtom } from '@state/atoms'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'

const normalizeTowns = (towns = []) =>
  Array.from(
    new Set(
      towns
        .map((town) => (typeof town === 'string' ? town.trim() : ''))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, 'ru'))

const normalizeEventTypes = (eventTypes = []) =>
  Array.from(
    new Set(
      eventTypes
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, 'ru'))

const ListsContent = () => {
  const siteSettings = useAtomValue(siteSettingsAtom)
  const modalsFunc = useAtomValue(modalsFuncAtom)

  const townsOptions = useMemo(
    () => normalizeTowns(siteSettings?.towns ?? []),
    [siteSettings?.towns]
  )
  const eventTypes = useMemo(
    () => normalizeEventTypes(siteSettings?.custom?.eventTypes ?? []),
    [siteSettings?.custom?.eventTypes]
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="flex w-full flex-col gap-3">
          <div className="flex w-full items-center justify-between gap-3 rounded border border-gray-200 p-3">
            <div className="flex flex-col gap-1">
              <div className="text-sm font-semibold text-gray-900">Города</div>
              <MutedText>
                По умолчанию:{' '}
                <span className="font-semibold text-gray-900">
                  {siteSettings?.defaultTown || 'Не выбран'}
                </span>
              </MutedText>
              <MutedText className="text-gray-500">
                Элементов: {townsOptions.length}
              </MutedText>
            </div>
            <button
              type="button"
              className="action-icon-button action-icon-button--warning flex h-10 w-10 cursor-pointer items-center justify-center rounded"
              onClick={() => modalsFunc.settings?.towns?.()}
              title="Редактировать города"
            >
              <FontAwesomeIcon className="h-5 w-5" icon={faPencilAlt} />
            </button>
          </div>
          <div className="flex w-full items-center justify-between gap-3 rounded border border-gray-200 p-3">
            <div className="flex flex-col gap-1">
              <div className="text-sm font-semibold text-gray-900">
                Типы события
              </div>
              <MutedText className="text-gray-500">
                Элементов: {eventTypes.length}
              </MutedText>
            </div>
            <button
              type="button"
              className="action-icon-button action-icon-button--warning flex h-10 w-10 cursor-pointer items-center justify-center rounded"
              onClick={() => modalsFunc.settings?.eventTypes?.()}
              title="Редактировать список мероприятий"
            >
              <FontAwesomeIcon className="h-5 w-5" icon={faPencilAlt} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ListsContent
