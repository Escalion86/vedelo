'use client'

import { useState } from 'react'
import Input from '@components/Input'
import PhoneInput from '@components/PhoneInput'
import ClipboardActionButton from '@components/ClipboardActionButton'

export default function ClipboardQaPage() {
  const [search, setSearch] = useState('')
  const [phone, setPhone] = useState(null)

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 p-4">
      <div className="flex items-end gap-2">
        <Input
          label="Поиск клиента"
          value={search}
          onChange={setSearch}
          placeholder="Имя или телефон"
          className="min-w-0 flex-1"
          fullWidth
          noMargin
        />
        <ClipboardActionButton
          action="paste"
          large
          onClick={async () => setSearch(await navigator.clipboard.readText())}
          title="Вставить из буфера обмена"
        />
      </div>
      <Input label="Профиль" value={search} onChange={setSearch} copyPasteButtons noMargin />
      <PhoneInput value={phone} onChange={setPhone} copyPasteButtons noMargin />
    </main>
  )
}
