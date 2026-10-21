import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Provider, createStore } from 'jotai'
import modalsAtom from '../../state/atoms/modalsAtom'
import modalsFuncAtom from '../../state/atoms/modalsFuncAtom'
import loggedUserAtom from '../../state/atoms/loggedUserAtom'
import ModalsPortal from '../../layouts/modals/ModalsPortal'
import EventProposalsSection from '../../components/EventProposalsSection'
import EventProposalsSummary from '../../components/EventProposalsSummary'
import ProposalTemplateEditor from '../../components/ProposalTemplateEditor'
import ProposalPageView from '../../components/ProposalPageView'
import Compact from '../../components/CompactEventForm'
import { queryKeys } from '../../helpers/queryKeys'
import { cacheEventProposal } from '../../helpers/useEventProposalsQuery'
import { normalizeProposalBlocks } from '../../helpers/proposalContent'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
})
window.queryClient = queryClient
window.cacheEventProposal = cacheEventProposal
window.queryKeys = queryKeys
const store = createStore()
window.submitted = 0
store.set(loggedUserAtom, {
  _id: 'u',
  firstName: 'Иван',
  phone: '+7 900 000 00 00',
  telegram: 'ivan', vk: 'id123', whatsapp: 79000000000,
})
store.set(modalsFuncAtom, {
  add(config) {
    store.set(modalsAtom, (current) => [
      ...current,
      { id: crypto.randomUUID(), props: config },
    ])
  },
  confirm(config) {
    window.confirmations = (window.confirmations || 0) + 1
    config.onConfirm?.()
  },
})
const params = new URLSearchParams(location.search)
const kind = params.get('kind') || 'proposal'
if (['proposal', 'template'].includes(kind)) {
  const isTemplate = kind === 'template'
  store.set(modalsAtom, [
    {
      id: 'editor',
      props: {
        title: isTemplate
          ? 'Редактор шаблона'
          : 'Редактор коммерческого предложения',
        Children: isTemplate ? ProposalTemplateEditor : EventProposalsSection,
        childrenProps: isTemplate
          ? { template: window.fixtureTemplate }
          : { eventId: 'event', initialProposal: window.fixtureProposal },
        confirmButtonName: isTemplate ? 'Сохранить' : undefined,
        closeButtonName: 'Закрыть',
        declineButtonName: 'Закрыть',
      },
    },
  ])
}
function App() {
  const [proposal, setProposal] = useState(window.fixtureProposal)
  useEffect(() => {
    window.showPublicProposal = (value) => setProposal(value)
    return () => { delete window.showPublicProposal }
  }, [])
  const publicProposal = {
    ...proposal,
    blocks: normalizeProposalBlocks(proposal.blocksSnapshot),
    media: proposal.mediaSnapshot,
    client: proposal.clientSnapshot,
    artist: proposal.artistSnapshot,
  }
  return (
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <main className="cabinet-canvas mx-auto max-w-4xl p-3">
          <h1>Проверка редактора КП</h1>
          {kind === 'public' ? (
            <ProposalPageView proposal={publicProposal} />
          ) : kind === 'list' ? (
            <Compact
              fields={{ proposals: <EventProposalsSection eventId="event" /> }}
              errors={{}}
              additionalEvents={[]}
              otherContacts={[]}
              documents={[]}
              services={[]}
              servicesIds={[]}
              status="draft"
              statusLabel="Заявка"
              proposalsEnabled
              proposalsSummary={<EventProposalsSummary eventId="event" />}
            />
          ) : (
            <p>Настоящий редактор в стандартном модальном окне</p>
          )}
        </main>
        <ModalsPortal />
      </Provider>
    </QueryClientProvider>
  )
}
createRoot(document.getElementById('root')).render(<App />)
