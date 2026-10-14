import { useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as Crypto from 'expo-crypto'
import { Button, Notice } from '../../shared/ui/components'
import { useTheme } from '../../shared/ui/ThemeProvider'
import { proposalsApi, type ProposalBlock } from './api'
import { LocalWebView } from './LocalWebView'
import { buildLocalDocument } from './localDocument'
import type { EditorCommand } from './bridge'
import { useProposalIdentity, type ProposalOperation } from './identity'
export function RichTextEditor({
  value,
  block,
  onChange,
  kind,
  id,
  disabled = false,
  onBusyChange,
  operation,
}: {
  value?: string
  block?: ProposalBlock
  onChange: (value: string) => void
  kind: 'template' | 'proposal'
  id: string
  disabled?: boolean
  onBusyChange?: (busy: boolean) => void
  operation?: () => ProposalOperation
}) {
  const { palette } = useTheme()
  const identity = useProposalIdentity()
  const [key] = useState(() => Crypto.randomUUID())
  const latest = useRef(value)
  const [command, setCommand] = useState<EditorCommand | null>(null)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const active = useRef(true),
    lock = useRef(false)
  const uploadLifetime = useRef<AbortController | null>(null)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      uploadLifetime.current?.abort()
    }
  }, [identity, kind, id])
  const html = useMemo(
    () =>
      buildLocalDocument({
        mode: 'editor',
        value,
        block,
        theme: palette.mode,
        key,
        editable: !disabled,
      }),
    [palette.mode, key]
  )
  useEffect(() => {
    if (value !== latest.current && value !== undefined) {
      latest.current = value
      setCommand({ type: 'setContent', html: value })
    }
  }, [value])
  const change = (next: string) => {
    if (disabled || lock.current) return
    latest.current = next
    onChange(next)
  }
  const upload = async (kindOfMedia: 'image' | 'video') => {
    if (disabled || lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    onBusyChange?.(true)
    const parent = operation?.()
    const controller = new AbortController()
    uploadLifetime.current = controller
    const cancel = () => controller.abort()
    parent?.signal?.addEventListener('abort', cancel, { once: true })
    if (parent?.signal?.aborted) cancel()
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type:
          kindOfMedia === 'image'
            ? ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
            : ['video/mp4', 'video/webm'],
        multiple: false,
        copyToCacheDirectory: true,
      })
      if (picked.canceled || !active.current || controller.signal.aborted) return
      const file = picked.assets[0]
      const url = await proposalsApi.uploadMedia(kind, id, file, {
        expectedIdentity: parent?.expectedIdentity ?? identity,
        signal: controller.signal,
      })
      if (!active.current || controller.signal.aborted) return
      // Native upload owns the bearer. JS receives only the resolved media URL.
      lock.current = false
      setCommand({
        type: 'insertMedia',
        kind: kindOfMedia,
        url,
        title: file.name,
      })
    } catch {
      if (active.current && !controller.signal.aborted)
        setError(
          'Не удалось загрузить медиа. Текст сохранён; повторите загрузку.'
        )
    } finally {
      parent?.signal?.removeEventListener('abort', cancel)
      if (uploadLifetime.current === controller) uploadLifetime.current = null
      lock.current = false
      if (active.current) {
        setBusy(false)
        onBusyChange?.(false)
      }
    }
  }
  return (
    <View style={{ gap: 8 }}>
      <Notice message="Визуальный текст до 30 000 символов: выделение, списки, ссылки и переменные. Фото до 10 МБ; видео MP4/WebM до 40 МБ." />
      {error ? <Notice tone="danger" message={error} /> : null}
      <View>
        <LocalWebView
          testID="proposal-richtext"
          html={html}
          sessionKey={key}
          onChange={change}
          editingEnabled={!disabled && !busy}
          command={command}
        />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button
          testID="proposal-richtext-image"
          title="Вставить фото"
          variant="secondary"
          loading={busy}
          disabled={disabled || busy}
          onPress={() => void upload('image')}
          style={{ flexGrow: 1, flexBasis: 140 }}
        />
        <Button
          testID="proposal-richtext-video"
          title="Вставить видео"
          variant="secondary"
          disabled={disabled || busy}
          onPress={() => void upload('video')}
          style={{ flexGrow: 1, flexBasis: 140 }}
        />
      </View>
    </View>
  )
}
