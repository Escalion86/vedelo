'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useAtomValue } from 'jotai'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import tariffsAtom from '@state/atoms/tariffsAtom'
import { getUserTariffAccess } from '@helpers/tariffAccess'
import Notice from '@components/Notice'
import GoogleCalendarImportSettings from '@components/GoogleCalendarImportSettings'
import useWorkItemTerminology from '@helpers/useWorkItemTerminology'

const FileImportSettings = dynamic(
  () => import('@components/FileImportSettings')
)

const ImportContent = () => {
  const [source, setSource] = useState('calendar')
  const [fileVisited, setFileVisited] = useState(false)
  const user = useAtomValue(loggedUserAtom)
  const tariffs = useAtomValue(tariffsAtom)
  const { allowAi } = getUserTariffAccess(user, tariffs)
  const terms = useWorkItemTerminology()
  if (!allowAi)
    return (
      <div className="p-2 sm:p-4">
        <Notice tone="info">
          Импорт {terms.pluralGenitive} использует ИИ и доступен только в тарифе с ИИ.
          Выберите подходящий тариф, чтобы загрузить файл или продолжить
          сохранённый импорт.
        </Notice>
      </div>
    )
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2 sm:p-4">
        <div
          className="mb-4 flex flex-wrap gap-2"
          role="group"
          aria-label="Источник импорта"
        >
          {[
            ['calendar', 'Google Calendar'],
            ['file', 'Из файла'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={source === value}
              className={`cursor-pointer rounded border px-3 py-2 text-sm ${source === value ? 'bg-general border-transparent text-white' : 'border-gray-500'}`}
              onClick={() => {
                setSource(value)
                if (value === 'file') setFileVisited(true)
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div hidden={source !== 'calendar'}>
          <GoogleCalendarImportSettings />
        </div>
        {fileVisited ? (
          <div hidden={source !== 'file'}>
            <FileImportSettings />
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default ImportContent
