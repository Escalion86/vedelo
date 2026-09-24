import Input from '@components/Input'
import ClipboardActionButton from '@components/ClipboardActionButton'
import getPersonFullName from '@helpers/getPersonFullName'
import {
  formatPhoneWithPlus,
  getInitialClientPhone,
  getPhoneDigits,
} from '@helpers/phoneUi'
import { modalsFuncAtom } from '@state/atoms'
import { useState } from 'react'
import { useAtomValue } from 'jotai'
import { useClientsQuery } from '@helpers/useClientsQuery'

const clientSelectFunc = (onSelect, title = 'Выбор клиента', options = {}) => {
  const { clientTypes } = options
  const ClientSelectModal = ({ closeModal }) => {
    const { data: clients = [] } = useClientsQuery()
    const modalsFunc = useAtomValue(modalsFuncAtom)
    const [search, setSearch] = useState('')

    const handlePasteSearch = async () => {
      try {
        const text = await navigator.clipboard.readText()
        setSearch(String(text ?? '').trim())
      } catch {
        // Браузер сам показывает запрос доступа к буферу обмена.
      }
    }

    const filteredClients = clients
      .filter((client) => {
        if (Array.isArray(clientTypes) && clientTypes.length > 0) {
          if (!clientTypes.includes(client.clientType ?? 'none')) return false
        }
        if (!search.trim()) return true
        const text = search.trim().toLowerCase()
        const matchesText = [
          client.firstName,
          client.secondName,
          client.thirdName,
          formatPhoneWithPlus(client.phone),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(text)
        const searchDigits = getPhoneDigits(search)
        const matchesPhone =
          searchDigits.length > 0 &&
          getPhoneDigits(client.phone).includes(searchDigits)

        return matchesText || matchesPhone
      })
      .sort((a, b) => (a.firstName ?? '').localeCompare(b.firstName ?? ''))

    const onPick = (client) => {
      onSelect && onSelect(client._id)
      closeModal()
    }

    return (
      <div className="flex h-full flex-col gap-2">
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
            onClick={handlePasteSearch}
            title="Вставить из буфера обмена"
          />
        </div>
        <button
          type="button"
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-700"
          onClick={() => {
            const initialPhone = getInitialClientPhone(search)
            modalsFunc.client?.add(
              (created) => {
                if (created?._id) {
                  onSelect && onSelect(created._id)
                  closeModal()
                }
              },
              { initialPhone }
            )
          }}
        >
          Создать клиента
        </button>
        <div className="flex-1 overflow-auto rounded border border-gray-200">
          {filteredClients.length === 0 ? (
            <div className="p-3 text-sm text-gray-500">
              Клиенты не найдены
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredClients.map((client) => (
                <button
                  key={client._id}
                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50"
                  onClick={() => onPick(client)}
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-gray-900">
                      {getPersonFullName(client, { fallback: '[Без имени]' })}
                    </span>
                    <span className="text-sm text-gray-600">
                      {formatPhoneWithPlus(client.phone) ||
                        'Телефон не указан'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return {
    title,
    closeButtonName: 'Закрыть',
    Children: ClientSelectModal,
  }
}

export default clientSelectFunc
