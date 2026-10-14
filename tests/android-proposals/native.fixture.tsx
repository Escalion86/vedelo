import React from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '../../mobile/src/shared/ui/ThemeProvider'
import { ProposalEditorScreen } from '../../mobile/src/features/proposals/ProposalEditorScreen'
import { EventProposalsSection } from '../../mobile/src/features/proposals/EventProposalsSection'
import { ProposalTemplatesScreen } from '../../mobile/src/features/proposals/ProposalTemplatesScreen'
import { Screen } from '../../mobile/src/shared/ui/components'
const fixture = (window as any).__fixture || {}
createRoot(document.getElementById('root')!).render(
  <ThemeProvider storage={null} forcedMode={fixture.mode || 'light'}>
    {fixture.screen === 'section' ? (
      <Screen>
        <EventProposalsSection eventId="e" eventStatus="active" />
      </Screen>
    ) : fixture.screen === 'library' ? (
      <ProposalTemplatesScreen />
    ) : (
      <ProposalEditorScreen kind="template" id="t" />
    )}
  </ThemeProvider>
)
