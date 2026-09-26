'use client'

import { useEffect, useState } from 'react'
import Notice from '@components/Notice'
import ProposalPageView from '@components/ProposalPageView'

const ProposalPublicClient = ({ publicId, token }) => {
  const [proposal, setProposal] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState('')

  useEffect(() => {
    let active = true
    fetch(`/api/public/proposals/${publicId}/${token}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok)
          throw new Error(body?.error?.message || 'Предложение недоступно')
        if (active) setProposal(body.data)
      })
      .catch((requestError) => active && setError(requestError.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [publicId, token])


  const selectPackage = async (packageId) => {
    setSending(packageId)
    setError('')
    try {
      const response = await fetch(
        `/api/public/proposals/${publicId}/${token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ packageId }),
        }
      )
      const body = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(body?.error?.message || 'Не удалось сохранить выбор')
      setProposal(body.data)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSending('')
    }
  }

  if (loading)
    return (
      <main className="flex min-h-dvh items-center justify-center bg-stone-50 p-5 text-sm text-stone-600">
        Загружаем предложение…
      </main>
    )
  if (error && !proposal)
    return (
      <main className="flex min-h-dvh items-center justify-center bg-stone-50 p-5">
        <Notice tone="error" className="max-w-md">
          {error}
        </Notice>
      </main>
    )
  if (!proposal) return null

  return <ProposalPageView proposal={proposal} error={error} sending={sending} selectPackage={selectPackage} />
}

export default ProposalPublicClient
