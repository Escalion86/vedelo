import { useEffect, useState } from 'react'
import { useAtomValue } from 'jotai'
import modalsFuncAtom from '@state/atoms/modalsFuncAtom'
import ServiceMultiSelect from '@components/ServiceMultiSelect'
import serviceFunc from './serviceFunc'

const selectEventServicesFunc = (initialIds, onApply) => {
  const SelectEventServices = ({ closeModal, setOnConfirmFunc }) => {
    const [selectedIds, setSelectedIds] = useState(initialIds)
    const modalsFunc = useAtomValue(modalsFuncAtom)

    useEffect(() => {
      setOnConfirmFunc(() => {
        onApply(selectedIds)
        closeModal()
      })
    }, [selectedIds, closeModal, setOnConfirmFunc])

    return (
      <ServiceMultiSelect
        value={selectedIds}
        onChange={setSelectedIds}
        onCreate={() => modalsFunc.add(serviceFunc(null, true, (service) => {
          if (service?._id) setSelectedIds((ids) => ids.includes(service._id) ? ids : [...ids, service._id])
        }))}
        onEdit={(id) => modalsFunc.add(serviceFunc(id))}
      />
    )
  }

  return {
    title: 'Выбор услуг',
    confirmButtonName: 'Применить',
    closeButtonName: 'Отмена',
    Children: SelectEventServices,
  }
}

export default selectEventServicesFunc
