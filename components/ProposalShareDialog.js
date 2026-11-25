'use client'

import { useRef, useState } from 'react'
import { useClientQuery } from '@helpers/useClientsQuery'
import { getProposalContactOptions } from '@helpers/proposalContactOptions'
import { copyProposalText } from '@helpers/copyProposalText'
import InputWrapper from '@components/InputWrapper'
import AppButton from '@components/AppButton'
import Notice from '@components/Notice'
import LoadingSpinner from '@components/LoadingSpinner'

export default function ProposalShareDialog({ clientId, message, publicUrl, initiallyCopied, reloadProposal }) {
  const [current, setCurrent] = useState({ clientId, message, publicUrl })
  const { data: client, isPending, isError, refetch } = useClientQuery(current.clientId)
  const [copied, setCopied] = useState(initiallyCopied ? 'text' : null)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState('')
  const inFlight = useRef(false)
  const options = getProposalContactOptions(client, current.message)
  const withCurrentProposal = async (run) => {
    if (inFlight.current) return
    inFlight.current = true
    setChecking(true)
    try {
      const fresh = await reloadProposal()
      const next = { clientId: fresh.clientId, message: fresh.renderedMessage || '', publicUrl: fresh.publicUrl }
      setCurrent(next)
      setCheckError('')
      await run(next)
    } catch (error) {
      setCopied(null)
      setCheckError(error.message || 'Не удалось проверить доступность предложения')
    } finally {
      inFlight.current = false
      setChecking(false)
    }
  }
  const copy = (kind) => withCurrentProposal(async (next) => {
    try {
      const value = kind === 'link' ? next.publicUrl : next.message
      if (!value) throw new Error('missing_text')
      await copyProposalText(value)
      setCopied(kind)
    } catch {
      setCopied(null)
    }
  })
  const openContact = (optionId) => withCurrentProposal((next) => {
    if (next.clientId !== current.clientId)
      throw new Error('Клиент предложения изменился. Проверьте контакты и повторите действие.')
    const option = getProposalContactOptions(client, next.message).find((item) => item.id === optionId)
    if (option) window.open(option.url, '_blank', 'noopener,noreferrer')
  })
  return (
    <div className="proposal-share-dialog space-y-4" aria-busy={checking}>
      {checkError ? <Notice tone="error" role="alert">{checkError}</Notice> : <>
        <Notice tone={copied ? 'info' : 'warning'}>
          {copied === 'link'
            ? 'Ссылка на предложение скопирована. Вставьте её в сообщение клиенту.'
            : copied === 'text'
              ? 'Текст предложения скопирован. Выберите способ связи, вставьте сообщение и отправьте клиенту.'
              : 'Не удалось скопировать автоматически. Нажмите «Скопировать текст» или «Скопировать ссылку», либо выделите сообщение ниже.'}
        </Notice>
        <InputWrapper label="Сообщение клиенту" fullWidth>
          <textarea
            aria-label="Текст предложения для отправки"
            className="w-full bg-transparent px-1 text-sm outline-none"
            rows={5}
            readOnly
            value={current.message}
            onFocus={(event) => event.target.select()}
          />
        </InputWrapper>
      </>}
      <div className="flex flex-wrap gap-2">
        <AppButton variant="secondary" size="sm" disabled={checking} onClick={() => copy('text')}>Скопировать текст</AppButton>
        {current.publicUrl ? (
          <AppButton variant="secondary" size="sm" disabled={checking} onClick={() => copy('link')}>Скопировать ссылку</AppButton>
        ) : null}
      </div>
      {current.clientId && isPending ? <div role="status" className="flex items-center gap-2"><LoadingSpinner />Загружаем контакты клиента…</div> : null}
      {isError ? <Notice tone="error">Не удалось загрузить контакты клиента. <AppButton variant="secondary" size="sm" onClick={() => refetch()}>Повторить</AppButton></Notice> : null}
      {!checkError && !isError && (!current.clientId || !isPending) && !options.length ? <Notice tone="info">У клиента не указаны способы связи. Текст можно отправить вручную через любое приложение.</Notice> : null}
      <div className="grid grid-cols-1 gap-2 tablet:grid-cols-2">
        {options.map((option) => (
          <AppButton key={option.id} variant="secondary" className="min-h-12 flex-col gap-1 rounded-lg" disabled={checking} onClick={() => openContact(option.id)}>
            <span>{option.label}{option.id === client.preferredContactChannel ? ' · приоритетный' : ''}</span>
            <span className="max-w-full text-xs font-normal break-all">{option.detail}</span>
          </AppButton>
        ))}
      </div>
    </div>
  )
}
