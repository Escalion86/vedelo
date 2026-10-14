import { useLocalSearchParams } from 'expo-router'
import { ProposalEditorScreen } from '../../../../src/features/proposals/ProposalEditorScreen'
export default function EventProposalEditor() {
  const { id, proposalId, preview } = useLocalSearchParams<{
    id: string
    proposalId: string
    preview?: string
  }>()
  return (
    <ProposalEditorScreen
      kind="proposal"
      id={proposalId}
      eventId={id}
      initialPreview={preview === '1'}
    />
  )
}
