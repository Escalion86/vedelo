import { useLocalSearchParams } from 'expo-router'
import { ProposalEditorScreen } from '../../../src/features/proposals/ProposalEditorScreen'
export default function ProposalTemplateEditor() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <ProposalEditorScreen kind="template" id={id} />
}
