import { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, View } from 'react-native'
import WebView from 'react-native-webview'
import {
  allowLocalNavigation,
  editorCommand,
  readEditorMessage,
  type EditorCommand,
} from './bridge'
export function LocalWebView({
  html,
  sessionKey,
  onChange,
  command,
  editingEnabled,
  height = 400,
  testID,
}: {
  html: string
  sessionKey: string
  onChange?: (html: string) => void
  command?: EditorCommand | null
  editingEnabled?: boolean
  height?: number
  testID?: string
}) {
  const native = useRef<WebView>(null),
    frame = useRef<HTMLIFrameElement>(null)
  const source = useMemo(() => ({ html, baseUrl: 'about:blank' }), [html])
  const sentCommand = useRef<EditorCommand | null>(null)
  const [ready, setReady] = useState(false)
  const callback = useRef(onChange)
  callback.current = onChange
  const message = (raw: string) => {
    const data = readEditorMessage(raw, sessionKey)
    if (data?.type === 'ready') setReady(true)
    if (data?.type === 'change') callback.current?.(data.html)
  }
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const handler = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        typeof event.data !== 'string'
      )
        return
      message(event.data)
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [sessionKey])
  const send = (value: EditorCommand) => {
    const script = editorCommand(value)
    if (Platform.OS === 'web')
      frame.current?.contentWindow?.postMessage(
        { key: sessionKey, command: value },
        '*'
      )
    else native.current?.injectJavaScript(script)
  }
  useEffect(() => {
    setReady(false)
  }, [html])
  useEffect(() => {
    if (ready && editingEnabled !== undefined)
      send({ type: 'setEditable', editable: editingEnabled })
  }, [ready, editingEnabled, sessionKey])
  useEffect(() => {
    if (!ready || !command || sentCommand.current === command) return
    send(command)
    sentCommand.current = command
  }, [command, ready, sessionKey])
  if (Platform.OS === 'web')
    return (
      <View testID={testID} style={{ height, width: '100%' }}>
        {/* Opaque origin: runtime cannot reach host/auth. */}
        <iframe
          ref={frame}
          srcDoc={html}
          onLoad={() => setReady(true)}
          sandbox="allow-scripts"
          title="Локальный редактор и предпросмотр КП"
          style={{ border: 0, width: '100%', height: '100%' }}
        />
      </View>
    )
  return (
    <WebView
      ref={native}
      testID={testID}
      source={source}
      style={{ height, flex: 0, backgroundColor: 'transparent' }}
      originWhitelist={['*']}
      onShouldStartLoadWithRequest={(request) =>
        allowLocalNavigation(request.url)
      }
      onMessage={(event) => message(event.nativeEvent.data)}
      nestedScrollEnabled
      javaScriptEnabled
      javaScriptCanOpenWindowsAutomatically={false}
      setSupportMultipleWindows={false}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      mixedContentMode="never"
      domStorageEnabled={false}
      sharedCookiesEnabled={false}
      thirdPartyCookiesEnabled={false}
      incognito
    />
  )
}
