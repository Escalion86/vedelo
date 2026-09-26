import { List } from 'react-window'
import { useMemo, useEffect, useState, useCallback } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import FormWrapper from '@components/FormWrapper'
import Button from '@components/Button'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import { postData } from '@helpers/CRUD'
import compareObjects from '@helpers/compareObjects'

const ITEM_HEIGHT = 46

const normalizeTowns = (towns = []) =>
  Array.from(
    new Set(
      towns
        .map((town) => (typeof town === 'string' ? town.trim() : ''))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, 'ru'))

const townsFunc = () => {
  const TownsModal = ({
    closeModal,
    setOnConfirmFunc,
    setOnShowOnCloseConfirmDialog,
    setDisableConfirm,
  }) => {
    const loggedUser = useAtomValue(loggedUserAtom)
    const [siteSettings, setSiteSettings] = useAtom(siteSettingsAtom)
    const [towns, setTowns] = useState(() =>
      normalizeTowns(siteSettings?.towns ?? [])
    )
    const [defaultTown, setDefaultTown] = useState(
      siteSettings?.defaultTown ?? ''
    )

    const normalizedTowns = useMemo(() => normalizeTowns(towns), [towns])

    const isChanged = useMemo(() => {
      const settingsTowns = normalizeTowns(siteSettings?.towns ?? [])
      const townsChanged = !compareObjects(settingsTowns, normalizedTowns)
      const defaultTownChanged =
        (siteSettings?.defaultTown ?? '') !== (defaultTown ?? '')
      return townsChanged || defaultTownChanged
    }, [defaultTown, normalizedTowns, siteSettings?.defaultTown, siteSettings?.towns])

    useEffect(() => {
      if (isChanged) return
      setTowns(normalizeTowns(siteSettings?.towns ?? []))
      setDefaultTown(siteSettings?.defaultTown ?? '')
    }, [isChanged, siteSettings?.defaultTown, siteSettings?.towns])

    const handleAddTown = () => {
      const newTown = window.prompt('Новый город')
      const trimmedTown = newTown?.trim()
      if (!trimmedTown) return
      setTowns((prev) => normalizeTowns([...prev, trimmedTown]))
      if (!defaultTown) setDefaultTown(trimmedTown)
    }

    const handleDeleteTown = (town) => {
      setTowns((prev) => normalizeTowns(prev.filter((item) => item !== town)))
      if (defaultTown === town) setDefaultTown('')
    }

    const handleSave = useCallback(async () => {
      const safeDefaultTown =
        defaultTown && normalizedTowns.includes(defaultTown)
          ? defaultTown
          : ''

      await postData(
        '/api/site',
        { towns: normalizedTowns, defaultTown: safeDefaultTown },
        (data) => setSiteSettings(data),
        null,
        false,
        loggedUser?._id
      )
      closeModal()
    }, [
      closeModal,
      defaultTown,
      loggedUser?._id,
      normalizedTowns,
      setSiteSettings,
    ])

    useEffect(() => {
      setDisableConfirm(!isChanged)
      setOnShowOnCloseConfirmDialog(isChanged)
      setOnConfirmFunc(isChanged ? handleSave : undefined)
    }, [isChanged, setDisableConfirm, setOnConfirmFunc, setOnShowOnCloseConfirmDialog, handleSave])

    const Row = ({ index, style }) => {
      const town = normalizedTowns[index]
      const isDefault = defaultTown === town
      return (
        <div
          style={style}
          className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2"
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border border-gray-300 text-transparent transition hover:border-emerald-500 hover:text-emerald-500"
              onClick={() => setDefaultTown(town)}
              title="Сделать городом по умолчанию"
            >
              {isDefault && (
                <FontAwesomeIcon
                  icon={faCheck}
                  className="h-3 w-3 text-emerald-600"
                />
              )}
            </button>
            <div className="text-sm font-medium text-gray-800">{town}</div>
          </div>
          <div className="flex items-center gap-2">
            {isDefault && (
              <span className="text-xs text-emerald-600">По умолчанию</span>
            )}
            <button
              type="button"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded border border-red-200 text-red-500 transition hover:bg-red-50"
              onClick={() => handleDeleteTown(town)}
              title="Удалить город"
            >
              <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
            </button>
          </div>
        </div>
      )
    }

    return (
      <FormWrapper className="flex h-full flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-gray-700">Города</div>
          <Button
            name=""
            onClick={handleAddTown}
            icon={faPlus}
            className="h-9 w-9 rounded-full text-base"
            title="Добавить город"
          />
        </div>

        <div className="flex-1 overflow-hidden rounded-lg border border-gray-200">
          {normalizedTowns.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              Городов пока нет
            </div>
          ) : (
            <List
              rowCount={normalizedTowns.length}
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
    title: 'Города',
    confirmButtonName: 'Сохранить',
    Children: TownsModal,
  }
}

export default townsFunc
