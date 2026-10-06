import { useLocalSearchParams } from 'expo-router'
import { CallDetail } from '../../src/features/calls/CallDetail'

export default function CallDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <CallDetail key={JSON.stringify(id)} id={id} />
}
