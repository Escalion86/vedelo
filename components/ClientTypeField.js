'use client'

import { useState } from 'react'
import ComboBox from './ComboBox'
import AppButton from './AppButton'
import Notice from './Notice'
import ClientTypesEditor from './ClientTypesEditor'
import { useClientTypes } from '@helpers/useClientTypes'
import { clientTypeOptions } from '@helpers/clientTypes.mjs'
import fieldHelp from '@helpers/fieldHelp.json'

export default function ClientTypeField({ value, onChange }) {
  const query = useClientTypes()
  const [editing, setEditing] = useState(false)
  return <div className="flex min-w-0 flex-col gap-2">
    <ComboBox label="Тип клиента" help={fieldHelp['client.type']} value={value} onChange={onChange}
      items={clientTypeOptions(query.items, value)} fullWidth />
    {query.error ? <Notice tone="error">Не удалось загрузить типы клиентов</Notice> : null}
    <AppButton variant="ghost" onClick={() => setEditing(!editing)}>{editing ? 'Закрыть настройку типов' : 'Добавить или настроить типы'}</AppButton>
    {editing ? <ClientTypesEditor onAdded={onChange} /> : null}
  </div>
}
