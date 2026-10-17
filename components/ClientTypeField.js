'use client'

import { useAtomValue } from 'jotai'
import { modalsFuncAtom } from '@state/atoms'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'
import IconActionButton from './IconActionButton'
import AddIconButton from './AddIconButton'
import clientTypesFunc from '@layouts/modals/modalsFunc/clientTypesFunc'
import listItemNameFunc from '@layouts/modals/modalsFunc/listItemNameFunc'
import ComboBox from './ComboBox'
import Notice from './Notice'
import { useClientTypes } from '@helpers/useClientTypes'
import { clientTypeOptions, validateClientTypes } from '@helpers/clientTypes.mjs'
import fieldHelp from '@helpers/fieldHelp.json'
import useSnackbar from '@helpers/useSnackbar'

export default function ClientTypeField({ value, onChange }) {
  const query = useClientTypes()
  const modals = useAtomValue(modalsFuncAtom)
  const snackbar = useSnackbar()
  const addType = () => modals.add(listItemNameFunc({
    title: 'Добавить тип клиента',
    onSave: async (name) => {
      const current = await query.refetch()
      if (current.error || !current.data) throw new Error('Не удалось загрузить типы клиентов')
      const value = `custom_${crypto.randomUUID()}`
      const items = validateClientTypes([
        ...current.data.items, { value, name, hidden: false },
      ], current.data.items)
      await query.save(items, current.data.version)
      onChange?.(value)
      snackbar.success('Тип клиента добавлен')
    },
  }))
  return <div className="flex min-w-0 flex-col gap-2">
    <ComboBox label="Тип клиента" help={fieldHelp['client.type']} value={value} onChange={onChange}
      items={clientTypeOptions(query.items, value)} className="min-w-0 flex-1" noMargin fullWidth
      postfix={<div className="flex shrink-0 items-center gap-1">
        <IconActionButton icon={faPencilAlt} variant="warning" size="sm" title="Редактировать типы клиентов" onClick={() => modals.add(clientTypesFunc(onChange))} />
        <AddIconButton size="sm" title="Добавить тип клиента" onClick={addType} />
      </div>} />
    {query.error ? <Notice tone="error">Не удалось загрузить типы клиентов</Notice> : null}
  </div>
}
