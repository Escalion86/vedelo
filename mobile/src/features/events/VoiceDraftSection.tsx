import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { File } from 'expo-file-system'
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import { api } from '../../shared/api/client'
import { Button, ErrorNotice, Field, SectionTitle, Surface } from '../../shared/ui/components'
import { colors, radius, spacing } from '../../shared/ui/theme'
import { countApplicableVoiceDraftFields, type VoiceDraftFields } from './voiceDraft'

const MAX_RECORDING_MS = 120_000

type Props = {
  onApply: (fields: VoiceDraftFields) => void
}

type TranscriptResponse = { success: boolean; transcript?: string }
type DraftResponse = { fields?: VoiceDraftFields | null; error?: string }

const durationLabel = (durationMillis: number) => {
  const totalSeconds = Math.max(0, Math.floor(durationMillis / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

export const VoiceDraftSection = ({ onApply }: Props) => {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const recorderState = useAudioRecorderState(recorder, 250)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recordingRef = useRef(false)
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [pendingFields, setPendingFields] = useState<VoiceDraftFields | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
  }

  const requestDraft = async (text: string) => {
    const response = await api.post<DraftResponse>('/mobile/v1/events/ai-draft', { text })
    const fields = response.fields || null
    if (!fields || countApplicableVoiceDraftFields(fields) === 0) {
      throw new Error(response.error || 'Не удалось выделить поля мероприятия')
    }
    setPendingFields(fields)
    setMessage(`Распознано полей: ${countApplicableVoiceDraftFields(fields)}. Проверьте текст и примените черновик.`)
  }

  const finishRecording = async () => {
    if (!recordingRef.current) return
    recordingRef.current = false
    setRecording(false)
    clearTimer()
    setBusy(true)
    setError('')
    setMessage('Распознаю запись…')
    let uri: string | null = null
    try {
      await recorder.stop()
      uri = recorder.uri
      await setAudioModeAsync({ allowsRecording: false })
      if (!uri) throw new Error('Файл записи не создан')

      const form = new FormData()
      form.append('audio', {
        uri,
        name: 'vedelo-voice-draft.m4a',
        type: 'audio/mp4',
      } as unknown as Blob)
      const response = await api.upload<TranscriptResponse>('/mobile/v1/events/voice-transcript', form)
      const text = response.transcript?.trim() || ''
      if (!text) throw new Error('Не удалось распознать речь')
      setTranscript(text)
      setMessage('Собираю поля мероприятия…')
      await requestDraft(text)
    } catch (reason) {
      setMessage('')
      setError(reason instanceof Error ? reason.message : 'Не удалось обработать голосовой черновик')
    } finally {
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined)
      if (uri) {
        try {
          const file = new File(uri)
          if (file.exists) file.delete()
        } catch {
          // Recorder cache will also be reclaimed by the operating system.
        }
      }
      setBusy(false)
    }
  }

  const startRecording = async () => {
    if (busy || recordingRef.current) return
    setError('')
    setMessage('')
    setPendingFields(null)
    try {
      const permission = await requestRecordingPermissionsAsync()
      if (!permission.granted) {
        setError('Без доступа к микрофону запись невозможна. Можно ввести текст вручную ниже.')
        return
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      await recorder.prepareToRecordAsync()
      recorder.record()
      recordingRef.current = true
      setRecording(true)
      timerRef.current = setTimeout(() => { void finishRecording() }, MAX_RECORDING_MS)
    } catch (reason) {
      recordingRef.current = false
      setRecording(false)
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined)
      setError(reason instanceof Error ? reason.message : 'Не удалось начать запись')
    }
  }

  const analyzeText = async () => {
    const text = transcript.trim()
    if (!text) {
      setError('Запишите голос или введите описание мероприятия')
      return
    }
    setBusy(true)
    setError('')
    setMessage('Собираю поля мероприятия…')
    setPendingFields(null)
    try {
      await requestDraft(text)
    } catch (reason) {
      setMessage('')
      setError(reason instanceof Error ? reason.message : 'Не удалось подготовить черновик')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => () => {
    clearTimer()
    if (recordingRef.current) void recorder.stop()
    void setAudioModeAsync({ allowsRecording: false })
  }, [recorder])

  return (
    <Surface>
      <View style={styles.titleRow}>
        <View style={styles.icon}><MaterialCommunityIcons name="microphone-outline" size={22} color={colors.primary} /></View>
        <View style={styles.grow}>
          <SectionTitle>AI-черновик по голосу</SectionTitle>
          <Text style={styles.hint}>Работает только с интернетом. Аудио и текст отправляются настроенному провайдеру распознавания и AI.</Text>
        </View>
      </View>

      {recording ? (
        <Pressable testID="voice-draft-stop" accessibilityRole="button" style={styles.recording} onPress={() => void finishRecording()}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>Идёт запись · {durationLabel(recorderState.durationMillis)}</Text>
          <Text style={styles.stopText}>Остановить</Text>
        </Pressable>
      ) : (
        <Button testID="voice-draft-start" title="Записать голос" variant="secondary" onPress={() => void startRecording()} disabled={busy} />
      )}

      <Field
        testID="voice-draft-text"
        label="Распознанный текст или описание"
        value={transcript}
        onChangeText={(value) => { setTranscript(value); setPendingFields(null); setMessage('') }}
        placeholder="Например: свадьба 15 августа в 18:00, Красноярск, бюджет 50 тысяч…"
        multiline
        editable={!recording && !busy}
      />
      <Button title="Разобрать текст" onPress={() => void analyzeText()} loading={busy} disabled={recording || !transcript.trim()} />
      {pendingFields ? <Button testID="voice-draft-apply" title="Применить к форме" variant="secondary" onPress={() => { onApply(pendingFields); setPendingFields(null); setMessage('Поля применены. Проверьте форму перед сохранением.') }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {error ? <ErrorNotice message={error} /> : null}
    </Surface>
  )
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  grow: { flex: 1 },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  recording: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerSoft },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  recordingText: { flex: 1, color: colors.danger, fontSize: 14, fontWeight: '700' },
  stopText: { color: colors.danger, fontSize: 13, fontWeight: '800' },
  message: { color: colors.success, fontSize: 13, lineHeight: 19, fontWeight: '600' },
})

