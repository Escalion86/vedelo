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
 * Используется и в списке мероприятий (FAB), и в нижней мобильной навигации.
 */
const useEventCreateMenu = () => {
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const loggedUser = useAtomValue(loggedUserAtom)
  const tariffs = useAtomValue(tariffsAtom)
  const siteSettings = useAtomValue(siteSettingsAtom)
  const queryClient = useQueryClient()
  const [photoDraftOpen, setPhotoDraftOpen] = useState(false)

  const allowVoiceDraft = useMemo(
    () => Boolean(getUserTariffAccess(loggedUser, tariffs)?.allowAi) && !resolveServerSyncDisabled(siteSettings),
    [loggedUser, tariffs, siteSettings]
  )

  const createDisabled = !modalsFunc.event?.create

  const handleCreateRequest = useCallback(() => {
    modalsFunc.event?.create?.('draft')
  }, [modalsFunc])

  const handleCreateByVoice = useCallback(() => {
    modalsFunc.event?.aiEdit?.(null, 'voice', { unified: true })
  }, [modalsFunc])

  const handleCreateByText = useCallback(() => {
    modalsFunc.event?.aiEdit?.(null, 'text', { unified: true })
  }, [modalsFunc])

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
      cacheAiClient(client)
      modalsFunc.event?.create?.(fields?.status || 'draft', {
        initialEvent: {
          ...fields,
          status: fields?.status || 'draft',
          description: fields?.description || sourceText,
        },
        aiFilledFields,
        aiWarnings,
        initialClient: client,
      })
    },
    [cacheAiClient, modalsFunc]
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
        label: 'Создать/Ред. голосом', usesAi: true,
        icon: <MicIcon fontSize="small" />,
        onClick: handleCreateByVoice,
      })
      if (loggedUser?.role === 'dev') result.push({ key: 'photo', label: 'Из фотографии', usesAi: true, icon: <PhotoCameraIcon fontSize="small" />, onClick: handleCreateByPhoto })
      result.push({
        key: 'text',
        label: 'Создать/Ред. свободным текстом', usesAi: true,
        icon: <TextSnippetIcon fontSize="small" />,
        onClick: handleCreateByText,
      })
    }
    return result
  }, [
    createDisabled,
    allowVoiceDraft,
    loggedUser?.role,
    handleCreateRequest,
    handleCreateByVoice,
    handleCreateByText,
    handleCreateByPhoto,
  ])

  const draftModals = photoDraftOpen && allowVoiceDraft && loggedUser?.role === 'dev'
    ? <PhotoDraftModal open onClose={() => setPhotoDraftOpen(false)} onDraft={handleTextDraft} />
    : null

  return { items, draftModals, createDisabled, createRequest: handleCreateRequest }
}

export default useEventCreateMenu
