import { useMemo } from 'react'
import * as Crypto from 'expo-crypto'
import { useWindowDimensions } from 'react-native'
import { LocalWebView } from './LocalWebView'
import { buildLocalDocument } from './localDocument'
export function ProposalPreview({ data }: { data: Record<string, unknown> }) {
  const { height } = useWindowDimensions(),
    key = useMemo(() => Crypto.randomUUID(), [data])
  const html = useMemo(
    () => buildLocalDocument({ mode: 'preview', data, key }),
    [data, key]
  )
  return (
    <LocalWebView
      key={key}
      testID="proposal-client-preview"
      html={html}
      sessionKey={key}
      height={Math.max(320, height - 180)}
    />
  )
}
