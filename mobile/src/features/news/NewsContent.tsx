import { useMemo } from 'react'
import { Alert, Linking, useWindowDimensions } from 'react-native'
import WebView from 'react-native-webview'
import { env } from '../../shared/config/env'
import { queueNativeIntent, resolveNativeDestination } from '../../shared/native/intents'
import { useTheme } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'

export const buildNewsDocument = (contentHtml: string, palette: Palette, fontScale = 1) => `<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>html{color-scheme:${palette.mode}}body{margin:12px;font:${16 * fontScale}px/1.5 sans-serif;color:${palette.text};background:${palette.canvas};overflow-wrap:anywhere}img{max-width:100%;height:auto}a{color:${palette.primary};text-decoration:underline}blockquote{margin:12px 0;padding-left:12px;border-left:3px solid ${palette.border}}h2,h3{line-height:1.3}li{margin:6px 0}</style></head><body>${contentHtml}</body></html>`

export function NewsContent({ html }: { html: string }) {
  const { palette } = useTheme(), { fontScale } = useWindowDimensions()
  const source = useMemo(() => ({ html: buildNewsDocument(html, palette, fontScale), baseUrl: new URL(env.apiBaseUrl).origin }), [html, palette, fontScale])
  const openLink = (url: string) => {
    if (resolveNativeDestination(url)) { queueNativeIntent(url); return }
    try {
      const target = new URL(url)
      if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password) return
      if (['vedelo.ru', 'www.vedelo.ru', 'artistcrm.ru', 'www.artistcrm.ru'].includes(target.hostname) && target.pathname.startsWith('/cabinet')) {
        Alert.alert('Переход недоступен', 'Откройте нужный раздел из меню приложения.'); return
      }
      Alert.alert('Открыть ссылку?', target.hostname, [{ text: 'Отмена', style: 'cancel' }, { text: 'Открыть', onPress: () => { void Linking.openURL(target.href).catch(() => Alert.alert('Не удалось открыть ссылку')) } }])
    } catch { /* Unsupported news link. */ }
  }
  return <WebView testID="news-content" source={source} style={{ flex: 1, backgroundColor: palette.canvas }}
    originWhitelist={['*']} javaScriptEnabled={false} javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows={false}
    allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
    domStorageEnabled={false} sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} incognito mixedContentMode="never"
    onShouldStartLoadWithRequest={request => {
      if (request.url === 'about:blank' || request.url === source.baseUrl || request.url === `${source.baseUrl}/`) return true
      if (request.isTopFrame !== false) openLink(request.url)
      return false
    }} onOpenWindow={event => openLink(event.nativeEvent.targetUrl)} />
}
