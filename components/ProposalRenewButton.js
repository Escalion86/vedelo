'use client'

import { useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { useQueryClient } from '@tanstack/react-query'
import modalsFuncAtom from '@state/atoms/modalsFuncAtom'
import AppButton from '@components/AppButton'
import { apiJson } from '@helpers/apiClient'
import { isProposalExpired } from '@helpers/proposalStatus.mjs'
import { cacheEventProposal } from '@helpers/useEventProposalsQuery'
import useSnackbar from '@helpers/useSnackbar'
import openProposalExpiryDateModal from '@layouts/modals/modalsFunc/proposalExpiryDateFunc'

export default function ProposalRenewButton({ proposal, eventId, disabled }) {
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const queryClient = useQueryClient()
  const snackbar = useSnackbar()
  const openRef = useRef(false)
  const [open, setOpen] = useState(false)
  if (!isProposalExpired(proposal)) return null

  const renew = () => {
    if (disabled || openRef.current) return
    openRef.current = true
    setOpen(true)
    openProposalExpiryDateModal({
      modalsFunc,
      title: proposal.title,
      onClose: () => {
        openRef.current = false
        setOpen(false)
      },
      onConfirm: async (validUntil) => {
        // Календарь открывается сразу; актуальная ревизия читается перед записью.
        const { data: current } = await apiJson(`/api/proposals/${proposal._id}`, {
          cache: 'no-store',
        })
        if (!current || !['published', 'expired'].includes(current.status))
          throw new Error('Предложение уже недоступно для продления. Обновите список.')
        if (new Date(current.validUntil) > new Date(validUntil)) {
          await cacheEventProposal(queryClient, eventId, current)
          throw new Error('Срок уже изменился. Выберите более позднюю дату.')
        }
        const { data: updated } = await apiJson(`/api/proposals/${proposal._id}`, {
          method: 'PATCH',
          body: JSON.stringify({ contentRevision: current.contentRevision || 0, validUntil }),
        })
        if (!updated) throw new Error('Не удалось продлить срок. Попробуйте ещё раз.')
        await cacheEventProposal(queryClient, eventId, updated)
        if (updated.status !== 'published') throw new Error('Выберите более позднюю дату.')
        snackbar.success('Срок предложения продлён')
      },
    })
  }

  return (
    <AppButton
      variant="secondary"
      size="sm"
      disabled={disabled || open}
      aria-haspopup="dialog"
      onClick={renew}
    >
      Продлить срок
    </AppButton>
  )
}
