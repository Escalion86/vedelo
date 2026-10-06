import { useLocalSearchParams } from 'expo-router'
import { ConversationDetail } from '../../../src/features/conversations/ConversationDetail'

export default function ConversationScreen() {
  const { provider, id } = useLocalSearchParams<{ provider: string; id: string }>()
  return <ConversationDetail key={JSON.stringify([provider, id])} provider={provider} id={id} />
}
