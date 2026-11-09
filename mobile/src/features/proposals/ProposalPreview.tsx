import { useMemo, useState } from 'react'
import * as Crypto from 'expo-crypto'
import { Linking, Platform, View, useWindowDimensions } from 'react-native'
import WebView from 'react-native-webview'
import { Button, Notice } from '../../shared/ui/components'
import { QuickActionsSheet } from '../../shared/ui/QuickContacts'
import { getProposalVideoEmbed } from './proposalVideoEmbed.generated'
import { LocalWebView } from './LocalWebView'
import { buildLocalDocument } from './localDocument'
export function ProposalPreview({ data }: { data: Record<string, unknown> }) {
  const { height } = useWindowDimensions(),
    key = useMemo(() => Crypto.randomUUID(), [data])
  const html = useMemo(
    () => buildLocalDocument({ mode: 'preview', data, key }),
    [data, key]
  )
  const [selected, setSelected] = useState('')
  const [error, setError] = useState(false)
  const videos = (Array.isArray(data.media) ? data.media : []).flatMap((item: Record<string, unknown> | null) => {
    if (item?.kind !== 'video_link' || typeof item.url !== 'string') return []
    const embed = getProposalVideoEmbed(item.url)
    if (!embed) return []
    const original = new URL(item.url)
    original.protocol = 'https:'
    return [{ ...embed, original: original.href, title: typeof item.title === 'string' && item.title || embed.provider }]
  })
  const video = videos.find(item => item.src === selected)
  return <>
    {videos.map((item, index) => <Button key={`${item.src}:${index}`} title={`Смотреть видео: ${item.title}`} variant="secondary" onPress={() => { setError(false); setSelected(item.src) }} />)}
    {video ? <QuickActionsSheet title={video.title} visible onClose={() => setSelected('')}>
      <View style={{ height: 240 }}>
        {Platform.OS === 'web' ? <iframe title={video.title} src={video.src} style={{ width: '100%', height: '100%', border: 0 }}
          sandbox="allow-scripts allow-same-origin allow-presentation" referrerPolicy="origin" allowFullScreen /> : <WebView
          key={video.src} source={{ uri: video.src, headers: { Referer: 'https://vedelo.ru/' } }}
          originWhitelist={['*']} onShouldStartLoadWithRequest={(request) => request.url === video.src}
          incognito sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false}
          setSupportMultipleWindows={false} javaScriptCanOpenWindowsAutomatically={false}
          allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
          allowFullscreenVideo mixedContentMode="never" onError={() => setError(true)} onHttpError={() => setError(true)} />}
      </View>
      {error ? <Notice message="Видео не загрузилось. Откройте его на сайте провайдера." /> : null}
      <Button title="Открыть исходное видео" variant="secondary" onPress={() => { void Linking.openURL(video.original).catch(() => setError(true)) }} />
    </QuickActionsSheet> : null}
    <LocalWebView
      key={key}
      testID="proposal-client-preview"
      html={html}
      sessionKey={key}
      height={Math.max(320, height - 180)}
    />
  </>
}
