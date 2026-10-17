'use client'

import { useAtomValue } from 'jotai'
import { modalsFuncAtom } from '@state/atoms'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'
import IconActionButton from './IconActionButton'
import clientTypesFunc from '@layouts/modals/modalsFunc/clientTypesFunc'
import ComboBox from './ComboBox'
import Notice from './Notice'
import { useClientTypes } from '@helpers/useClientTypes'
import { clientTypeOptions } from '@helpers/clientTypes.mjs'
import fieldHelp from '@helpers/fieldHelp.json'

export default function ClientTypeField({ value, onChange }) {
  const query = useClientTypes()
  const modals = useAtomValue(modalsFuncAtom)
  return <div className="flex min-w-0 flex-col gap-2">
    <div className="flex min-w-0 items-end gap-2">
      <ComboBox label="Тип клиента" help={fieldHelp['client.type']} value={value} onChange={onChange}
        items={clientTypeOptions(query.items, value)} className="min-w-0 flex-1" noMargin fullWidth />
      <IconActionButton icon={faPencilAlt} variant="warning" title="Редактировать типы клиентов" className="shrink-0" onClick={() => modals.add(clientTypesFunc(onChange))} />
    </div>
    {query.error ? <Notice tone="error">Не удалось загрузить типы клиентов</Notice> : null}
  </div>
}
