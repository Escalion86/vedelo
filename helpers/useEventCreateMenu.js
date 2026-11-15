'use client'

import { useCallback, useMemo, useState } from 'react'
import { useAtomValue } from 'jotai'
import { useQueryClient } from '@tanstack/react-query'
import MicIcon from '@mui/icons-material/Mic'
import NoteAddIcon from '@mui/icons-material/NoteAdd'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import PhotoDraftModal from '@components/PhotoDraftModal'
import TextSnippetIcon from '@mui/icons-material/TextSnippet'
import { modalsFuncAtom } from '@state/atoms'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import tariffsAtom from '@state/atoms/tariffsAtom'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import { resolveServerSyncDisabled } from '@helpers/serverSyncMode'
import { getUserTariffAccess } from '@helpers/tariffAccess'
import { queryKeys } from '@helpers/queryKeys'

/**
 * Общее меню: обычная форма, создание/редактирование голосом и текстом,
 * отдельное создание из фотографии.
 * Используется в списке мероприятий, нижней навигации и карточке клиента.
 */
const useEventCreateMenu = (initialClient = null, onContinue) => {
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const loggedUser = useAtomValue(loggedUserAtom)
  const tariffs = useAtomValue(tariffsAtom)
  const siteSettings = useAtomValue(siteSettingsAtom)
  const queryClient = useQueryClient()
  const [photoDraftOpen, setPhotoDraftOpen] = useState(false)
  const clientId = initialClient?._id

  const allowVoiceDraft = useMemo(
    () => Boolean(getUserTariffAccess(loggedUser, tariffs)?.allowAi) && !resolveServerSyncDisabled(siteSettings),
    [loggedUser, tariffs, siteSettings]
  )

  const createDisabled = !modalsFunc.event?.create

  const handleCreateRequest = useCallback(() => {
    onContinue?.()
    if (clientId) {
      modalsFunc.event?.create?.('draft', { initialClient })
    } else {
      modalsFunc.event?.create?.('draft')
    }
  }, [modalsFunc, clientId, initialClient, onContinue])

  const handleCreateWithAi = useCallback((mode) => {
    onContinue?.()
    modalsFunc.event?.aiEdit?.(null, mode, clientId ? { initialClient } : { unified: true })
  }, [modalsFunc, clientId, initialClient, onContinue])

  const handleCreateByPhoto = useCallback(() => setPhotoDraftOpen(true), [])

  const cacheAiClient = useCallback(
    (client) => {
      if (!client?._id) return
      queryClient.setQueryData(queryKeys.client(client._id), client)
      queryClient.setQueriesData({ queryKey: ['clients'] }, (current) => {
        if (!Array.isArray(current)) return current
        const exists = current.some(
          (item) => String(item?._id) === String(client._id)
        )
        if (!exists) return [...current, client]
        return current.map((item) =>
          String(item?._id) === String(client._id) ? client : item
        )
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.clients() })
    },
    [queryClient]
  )

  const handleTextDraft = useCallback(
    (fields, sourceText, aiFilledFields, client, aiWarnings) => {
      setPhotoDraftOpen(false)
      onContinue?.()
      if (!clientId) cacheAiClient(client)
      modalsFunc.event?.create?.(fields?.status || 'draft', {
        initialEvent: {
          ...fields,
          ...(clientId ? { clientId } : {}),
          status: fields?.status || 'draft',
          description: fields?.description || sourceText,
        },
        aiFilledFields: clientId ? aiFilledFields.filter((field) => field !== 'clientId') : aiFilledFields,
        aiWarnings,
        initialClient: clientId ? initialClient : client,
      })
    },
    [cacheAiClient, modalsFunc, clientId, initialClient, onContinue]
  )

  const items = useMemo(() => {
    if (createDisabled) return []
    const result = [
      {
        key: 'request',
        label: 'Форма',
        icon: <NoteAddIcon fontSize="small" />,
        onClick: handleCreateRequest,
      },
    ]
    if (allowVoiceDraft) {
      result.push({
        key: 'voice',
        label: clientId ? 'Голосом' : 'Создать/Ред. голосом', usesAi: true,
        icon: <MicIcon fontSize="small" />,
        onClick: () => handleCreateWithAi('voice'),
      })
      result.push({ key: 'photo', label: 'Из фотографии', usesAi: true, icon: <PhotoCameraIcon fontSize="small" />, onClick: handleCreateByPhoto })
      result.push({
        key: 'text',
        label: clientId ? 'Свободным текстом' : 'Создать/Ред. свободным текстом', usesAi: true,
        icon: <TextSnippetIcon fontSize="small" />,
        onClick: () => handleCreateWithAi('text'),
      })
    }
    return result
  }, [
    createDisabled,
    allowVoiceDraft,
    handleCreateRequest,
    clientId,
    handleCreateWithAi,
    handleCreateByPhoto,
  ])

  const draftModals = photoDraftOpen && allowVoiceDraft
    ? <PhotoDraftModal open useSelectedClient={Boolean(clientId)} onClose={() => setPhotoDraftOpen(false)} onDraft={handleTextDraft} />
    : null

  return { items, draftModals, createDisabled, createRequest: handleCreateRequest }
}

export default useEventCreateMenu
