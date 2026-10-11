import fieldHelp from '@helpers/fieldHelp.json'
import FieldHelp from '@components/FieldHelp'
import { useCallback, useEffect, useState } from 'react'
import { useAtom } from 'jotai'
import AddressPicker from '@components/AddressPicker'
import Button from '@components/Button'
import { postData } from '@helpers/CRUD'
import { formatAddressPoolShort, getAddressPoolSignature } from '@helpers/addressPool'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'

const addressEditorFunc = ({
  address,
  onChange,
  townOptions,
  onCreateTown,
  allowTownCreate,
  poolAddresses: controlledPoolAddresses,
  onSaveAddress,
  saveButtonLabel,
  savedLabel,
}) => {
  const AddressEditorModal = ({ closeModal, setOnConfirmFunc }) => {
    const [draft, setDraft] = useState(() => ({ ...address }))
    const [siteSettings, setSiteSettings] = useAtom(siteSettingsAtom)
    const [savedSignature, setSavedSignature] = useState(null)
    const poolAddresses = Array.isArray(controlledPoolAddresses)
      ? controlledPoolAddresses
      : (siteSettings?.addresses ?? [])
    const signature = getAddressPoolSignature(draft)
    const isAddressInPool = Boolean(formatAddressPoolShort(draft)) && (
      signature === savedSignature ||
      poolAddresses.some((item) => getAddressPoolSignature(item) === signature)
    )

    const handleApply = useCallback(() => {
      onChange?.({ ...draft })
      closeModal()
    }, [draft, closeModal])

    useEffect(() => {
      setOnConfirmFunc(handleApply)
    }, [handleApply, setOnConfirmFunc])

    const handleSaveToPool = async () => {
      if (typeof onSaveAddress === 'function') {
        await onSaveAddress({ ...draft })
        setSavedSignature(signature)
        return
      }
      await postData('/api/site', { addAddress: draft }, (data) => {
        setSiteSettings(data)
        setSavedSignature(signature)
      })
    }

    return (
      <div className="flex min-w-0 flex-col gap-2">
        <AddressPicker
          address={draft}
          onChange={setDraft}
          label=""
          townOptions={townOptions}
          onCreateTown={onCreateTown}
          allowTownCreate={allowTownCreate}
          noWrapper
        />
        <div className="flex items-center gap-x-2">
          {formatAddressPoolShort(draft) && !isAddressInPool && (
            <>
              <Button name={saveButtonLabel} onClick={handleSaveToPool} thin />
              <FieldHelp text={fieldHelp['address.saveToPool']} label={saveButtonLabel || 'Сохранить в пул'} />
            </>
          )}
          {isAddressInPool && <span className="text-sm">{savedLabel}</span>}
        </div>
      </div>
    )
  }

  return {
    title: 'Редактирование адреса',
    confirmButtonName: 'Применить',
    closeButtonName: 'Отмена',
    Children: AddressEditorModal,
  }
}

export default addressEditorFunc
