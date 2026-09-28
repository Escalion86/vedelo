'use client'

import { useState } from 'react'
import { useClientQuery } from '@helpers/useClientsQuery'
import { getProposalContactOptions } from '@helpers/proposalContactOptions'
import { copyProposalText } from '@helpers/copyProposalText'
import InputWrapper from '@components/InputWrapper'
import AppButton from '@components/AppButton'
import Notice from '@components/Notice'
import LoadingSpinner from '@components/LoadingSpinner'

export default function ProposalShareDialog({ clientId, message, initiallyCopied }) {
  const { data: client, isPending, isError, refetch } = useClientQuery(clientId)
  const [copied, setCopied] = useState(initiallyCopied)
  const options = getProposalContactOptions(client, message)
  const copy = async () => {
    try {
      await copyProposalText(message)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="proposal-share-dialog space-y-4">
      <Notice tone={copied ? 'info' : 'warning'}>
        {copied
          ? 'Текст предложения скопирован. Выберите способ связи, вставьте сообщение и отправьте клиенту.'
          : 'Не удалось скопировать автоматически. Нажмите «Скопировать текст» или выделите сообщение ниже.'}
      </Notice>
      <InputWrapper label="Сообщение клиенту" fullWidth>
      <textarea
        aria-label="Текст предложения для отправки"
        className="w-full bg-transparent px-1 text-sm outline-none"
        rows={5}
        readOnly
        value={message}
        onFocus={(event) => event.target.select()}
      />
      </InputWrapper>
      <AppButton variant="secondary" size="sm" onClick={copy}>Скопировать текст</AppButton>
      {clientId && isPending ? <div role="status" className="flex items-center gap-2"><LoadingSpinner />Загружаем контакты клиента…</div> : null}
      {isError ? <Notice tone="error">Не удалось загрузить контакты клиента. <AppButton variant="secondary" size="sm" onClick={() => refetch()}>Повторить</AppButton></Notice> : null}
      {!isError && (!clientId || !isPending) && !options.length ? <Notice tone="info">У клиента не указаны способы связи. Текст можно отправить вручную через любое приложение.</Notice> : null}
      <div className="grid grid-cols-1 gap-2 tablet:grid-cols-2">
        {options.map((option) => (
          <AppButton key={option.id} variant="secondary" className="min-h-12 flex-col gap-1 rounded-lg" onClick={() => window.open(option.url, '_blank', 'noopener,noreferrer')}>
            <span>{option.label}{option.id === client.preferredContactChannel ? ' · приоритетный' : ''}</span>
            <span className="max-w-full text-xs font-normal break-all">{option.detail}</span>
          </AppButton>
        ))}
      </div>
    </div>
  )
}
