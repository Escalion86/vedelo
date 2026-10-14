import React from 'react'
import { createRoot } from 'react-dom/client'
import ProposalPageView from '../../../../../components/ProposalPageView.js'
document.addEventListener('click', (event) => {
  if (event.target.closest('a')) event.preventDefault()
})
createRoot(document.getElementById('root')).render(
  <ProposalPageView proposal={window.__VEDELO_LOCAL__.data} preview />
)
