'use client'

import { useCallback, useMemo, useState } from 'react'
import { useAtomValue } from 'jotai'
import { useQueryClient } from '@tanstack/react-query'
import MicIcon from '@mui/icons-material/Mic'
import NoteAddIcon from '@mui/icons-material/NoteAdd'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import PhotoDraftModal from '@components/PhotoDraftModal'
import TextSnippetIcon from '@mui/icons-material/TextSnippet'
import TextDraftModal from '@components/TextDraftModal'
import VoiceDraftOverlay from '@components/VoiceDraftOverlay'
import { modalsFuncAtom } from '@state/atoms'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import tariffsAtom from '@state/atoms/tariffsAtom'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import { resolveServerSyncDisabled } from '@helpers/serverSyncMode'
import { getUserTariffAccess } from '@helpers/tariffAccess'
import { queryKeys } from '@helpers/queryKeys'

/**
 * Общее меню создания заказа/мероприятия (Форма, Голосом,
 * Свободным текстом) + модалки голосового и текстового черновиков.
 * Используется и в списке мероприятий (FAB), и в нижней мобильной навигации.
 */
const useEventCreateMenu = () => {
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const loggedUser = useAtomValue(loggedUserAtom)
  const tariffs = useAtomValue(tariffsAtom)
  const siteSettings = useAtomValue(siteSettingsAtom)
  const queryClient = useQueryClient()
  const [voiceDraftOpen, setVoiceDraftOpen] = useState(false)
  const [photoDraftOpen, setPhotoDraftOpen] = useState(false)
  const [textDraftOpen, setTextDraftOpen] = useState(false)

  const allowVoiceDraft = useMemo(
    () => Boolean(getUserTariffAccess(loggedUser, tariffs)?.allowAi),
    [loggedUser, tariffs]
  )

  const createDisabled = !modalsFunc.event?.create

  const handleCreateRequest = useCallback(() => {
    modalsFunc.event?.create?.('draft')
  }, [modalsFunc])

  const handleCreateByVoice = useCallback(() => {
    setVoiceDraftOpen(true)
  }, [])

  const handleCreateByText = useCallback(() => {
    setTextDraftOpen(true)
  }, [])

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

  const handleVoiceDraft = useCallback(
    (fields, transcript, aiFilledFields, client, aiWarnings) => {
      setVoiceDraftOpen(false)
      cacheAiClient(client)
      modalsFunc.event?.create?.(fields?.status || 'draft', {
        initialEvent: {
          ...fields,
          status: fields?.status || 'draft',
          description:
            fields?.description ||
            (transcript ? `Голосовой ввод: ${transcript}` : ''),
        },
        aiFilledFields,
        aiWarnings,
        initialClient: client,
      })
    },
    [cacheAiClient, modalsFunc]
  )

  const handleTextDraft = useCallback(
    (fields, sourceText, aiFilledFields, client, aiWarnings) => {
      setTextDraftOpen(false)
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
        label: 'Голосом', usesAi: true,
        icon: <MicIcon fontSize="small" />,
        onClick: handleCreateByVoice,
      })
      if (loggedUser?.role === 'dev') result.push({ key: 'photo', label: 'Из фотографии', usesAi: true, icon: <PhotoCameraIcon fontSize="small" />, onClick: handleCreateByPhoto })
      result.push({
        key: 'text',
        label: 'Свободным текстом', usesAi: true,
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

  const draftModals = (
    <>
      {voiceDraftOpen ? (
        <VoiceDraftOverlay
          onClose={() => setVoiceDraftOpen(false)}
          onDraft={handleVoiceDraft}
        />
      ) : null}
      {photoDraftOpen && allowVoiceDraft && loggedUser?.role === 'dev' ? <PhotoDraftModal open onClose={() => setPhotoDraftOpen(false)} onDraft={handleTextDraft} /> : null}
      <TextDraftModal
        open={textDraftOpen}
        onClose={() => setTextDraftOpen(false)}
        onDraft={handleTextDraft}
      />
    </>
  )

  const editItems = allowVoiceDraft && !resolveServerSyncDisabled(siteSettings) ? [
    { key: 'edit-voice', label: 'Голосом', usesAi: true, icon: <MicIcon fontSize="small" />, onClick: () => modalsFunc.event?.aiEdit?.(null, 'voice') },
    { key: 'edit-text', label: 'Свободным текстом', usesAi: true, icon: <TextSnippetIcon fontSize="small" />, onClick: () => modalsFunc.event?.aiEdit?.(null, 'text') },
  ] : []
  return { items, editItems, draftModals, createDisabled, createRequest: handleCreateRequest }
}

export default useEventCreateMenu
