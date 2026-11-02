import { useLocalSearchParams } from 'expo-router'
import { ProposalEditorScreen } from '../../../src/features/proposals/ProposalEditorScreen'
export default function ProposalTemplateEditor() {
  const { id, sourceProposalId } = useLocalSearchParams<{ id: string; sourceProposalId?: string }>()
  return <ProposalEditorScreen kind="template" id={id} sourceProposalId={sourceProposalId} />
}
