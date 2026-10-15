import React from 'react'
import { createRoot } from 'react-dom/client'
import ProposalPublicClient from '../../app/proposal/[publicId]/[token]/ProposalPublicClient'
import ProposalPageView from '../../components/ProposalPageView'

const params = new URLSearchParams(location.search)
document.body.className = (params.get('appTheme') || params.get('theme')) === 'dark' ? 'theme-dark' : ''
createRoot(document.getElementById('root')).render(
  params.has('preview')
    ? <ProposalPageView preview proposal={{ ...window.previewProposal, ...(params.has('pending') ? { selectionLocked: true, applicationPending: true, appliedAt: null, appliedPackageId: '' } : {}), appearance: { theme: params.get('theme') || 'light' } }} />
    : <ProposalPublicClient publicId="test" token="synthetic" />
)
