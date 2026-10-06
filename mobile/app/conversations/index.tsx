import { useLocalSearchParams } from 'expo-router'
import { ConversationsList } from '../../src/features/conversations/ConversationsList'

export default function ConversationsScreen() {
  const { clientId, eventId } = useLocalSearchParams<{ clientId?: string; eventId?: string }>()
  return <ConversationsList key={JSON.stringify([clientId, eventId])} clientId={clientId} eventId={eventId} />
}
