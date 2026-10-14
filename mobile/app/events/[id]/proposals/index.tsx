import { useLocalSearchParams } from 'expo-router'
import { Screen } from '../../../../src/shared/ui/components'
import { EventProposalsSection } from '../../../../src/features/proposals/EventProposalsSection'
export default function EventProposalsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return (
    <Screen>
      <EventProposalsSection eventId={id} />
    </Screen>
  )
}
