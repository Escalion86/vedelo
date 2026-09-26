import { List } from 'react-window'
import { useMemo, useEffect, useState, useCallback } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import FormWrapper from '@components/FormWrapper'
import Button from '@components/Button'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faTrash } from '@fortawesome/free-solid-svg-icons'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import { postData } from '@helpers/CRUD'
import compareObjects from '@helpers/compareObjects'

const ITEM_HEIGHT = 46

const normalizeEventTypes = (items = []) =>
  Array.from(
    new Set(
      items
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, 'ru'))

const eventTypesFunc = () => {
  const EventTypesModal = ({
    closeModal,
    setOnConfirmFunc,
    setOnShowOnCloseConfirmDialog,
    setDisableConfirm,
  }) => {
    const loggedUser = useAtomValue(loggedUserAtom)
    const [siteSettings, setSiteSettings] = useAtom(siteSettingsAtom)
    const [eventTypes, setEventTypes] = useState(() =>
      normalizeEventTypes(siteSettings?.custom?.eventTypes ?? [])
    )

    const normalizedEventTypes = useMemo(
      () => normalizeEventTypes(eventTypes),
      [eventTypes]
    )

    const isChanged = useMemo(() => {
      const settingsTypes = normalizeEventTypes(
        siteSettings?.custom?.eventTypes ?? []
      )
      return !compareObjects(settingsTypes, normalizedEventTypes)
    }, [normalizedEventTypes, siteSettings?.custom?.eventTypes])

    useEffect(() => {
      if (isChanged) return
      setEventTypes(normalizeEventTypes(siteSettings?.custom?.eventTypes ?? []))
    }, [isChanged, siteSettings?.custom?.eventTypes])

    const handleAddEventType = () => {
      const newValue = window.prompt('Новый тип мероприятия')
      const trimmed = newValue?.trim()
      if (!trimmed) return
      setEventTypes((prev) => normalizeEventTypes([...prev, trimmed]))
    }

    const handleDeleteEventType = (value) => {
      setEventTypes((prev) => normalizeEventTypes(prev.filter((item) => item !== value)))
    }

    const handleSave = useCallback(async () => {
      await postData(
        '/api/site',
        {
          custom: {
            ...(siteSettings?.custom ?? {}),
            eventTypes: normalizedEventTypes,
          },
        },
        (data) => setSiteSettings(data),
        null,
        false,
        loggedUser?._id
      )
      closeModal()
    }, [
      closeModal,
      loggedUser?._id,
      normalizedEventTypes,
      setSiteSettings,
      siteSettings?.custom,
    ])

    useEffect(() => {
      setDisableConfirm(!isChanged)
      setOnShowOnCloseConfirmDialog(isChanged)
      setOnConfirmFunc(isChanged ? handleSave : undefined)
    }, [
      handleSave,
      isChanged,
      setDisableConfirm,
      setOnConfirmFunc,
      setOnShowOnCloseConfirmDialog,
    ])

    const Row = ({ index, style }) => {
      const value = normalizedEventTypes[index]
      return (
        <div
          style={style}
          className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2"
        >
          <div className="text-sm font-medium text-gray-800">{value}</div>
          <button
            type="button"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded border border-red-200 text-red-500 transition hover:bg-red-50"
            onClick={() => handleDeleteEventType(value)}
            title="Удалить тип"
          >
            <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
          </button>
        </div>
      )
    }

    return (
      <FormWrapper className="flex h-full flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-gray-700">
            Что за мероприятие
          </div>
          <Button
            name=""
            onClick={handleAddEventType}
            icon={faPlus}
            className="h-9 w-9 rounded-full text-base"
            title="Добавить тип"
          />
        </div>

        <div className="flex-1 overflow-hidden rounded-lg border border-gray-200">
          {normalizedEventTypes.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              Типов пока нет
            </div>
          ) : (
            <List
              rowCount={normalizedEventTypes.length}
              rowHeight={ITEM_HEIGHT}
              rowComponent={Row}
              rowProps={{}}
              style={{ height: '100%', width: '100%' }}
            />
          )}
        </div>
      </FormWrapper>
    )
  }

  return {
    title: 'Список: Что за мероприятие',
    confirmButtonName: 'Сохранить',
    Children: EventTypesModal,
  }
}

export default eventTypesFunc
