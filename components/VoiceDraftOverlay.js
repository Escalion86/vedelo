'use client'


import { useCallback, useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import AppButton from '@components/AppButton'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faExclamationTriangle,
  faMicrophone,
  faSpinner,
} from '@fortawesome/free-solid-svg-icons'

const getPreferredAudioMimeType = () => {
  if (typeof window === 'undefined' || !window.MediaRecorder) return ''
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
  ]
  return candidates.find((type) => window.MediaRecorder.isTypeSupported(type)) || ''
}

const getAudioFileName = (mimeType) => {
  if (mimeType.includes('mp4')) return 'voice-draft.mp4'
  if (mimeType.includes('mpeg')) return 'voice-draft.mp3'
  return 'voice-draft.webm'
}

const VoiceDraftOverlay = ({ onClose, onDraft, onTranscript }) => {
  const [status, setStatus] = useState('starting')
  const [errorMessage, setErrorMessage] = useState('')
  const [level, setLevel] = useState(0)
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const audioContextRef = useRef(null)
  const animationFrameRef = useRef(null)
  const activeRef = useRef(false)
  const generationRef = useRef(0)
  const requestRef = useRef(null)

  const cleanupAudio = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    audioContextRef.current?.close?.().catch(() => {})
    audioContextRef.current = null
    streamRef.current?.getTracks?.().forEach((track) => track.stop())
    streamRef.current = null
    setLevel(0)
  }, [])

  const discardRecording = useCallback(() => {
    activeRef.current = false
    generationRef.current += 1
    requestRef.current?.abort()
    requestRef.current = null
    const recorder = recorderRef.current
    recorderRef.current = null
    if (recorder) {
      recorder.onstop = null
      recorder.ondataavailable = null
      if (recorder.state !== 'inactive') recorder.stop()
    }
    chunksRef.current = []
    cleanupAudio()
  }, [cleanupAudio])

  const cancelRecording = useCallback(() => {
    if (!activeRef.current) return
    discardRecording()
    onClose()
  }, [discardRecording, onClose])

  const startLevelMeter = useCallback((stream) => {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return

    const audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(stream)
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    audioContextRef.current = audioContext

    const data = new Uint8Array(analyser.fftSize)
    const tick = () => {
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i += 1) {
        const value = (data[i] - 128) / 128
        sum += value * value
      }
      const rms = Math.sqrt(sum / data.length)
      setLevel(Math.min(1, rms * 8))
      animationFrameRef.current = requestAnimationFrame(tick)
    }
    tick()
  }, [])

  const processAudioBlob = useCallback(
    async (audioBlob, generation) => {
      const isCurrent = () => activeRef.current && generationRef.current === generation
      if (!isCurrent()) return
      if (!audioBlob || audioBlob.size === 0) {
        setStatus('error')
        setErrorMessage('Не удалось записать аудио')
        return
      }

      setStatus('processing')
      cleanupAudio()

      try {
        const controller = new AbortController()
        requestRef.current = controller
        const formData = new FormData()
        formData.set('audio', audioBlob, getAudioFileName(audioBlob.type || ''))

        const transcriptResponse = await fetch('/api/events/voice-transcript', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        })
        const transcriptPayload = await transcriptResponse.json().catch(() => null)
        if (!isCurrent()) return
        if (!transcriptResponse.ok || transcriptPayload?.error) {
          throw new Error(
            transcriptPayload?.error || 'Не удалось распознать голос'
          )
        }

        const transcript = String(transcriptPayload?.transcript || '').trim()
        if (!transcript) throw new Error('Не удалось распознать речь')
        if (onTranscript) {
          onTranscript(transcript)
          return
        }

        const draftResponse = await fetch('/api/events/ai-draft', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text: transcript }),
          signal: controller.signal,
        })
        const draftPayload = await draftResponse.json().catch(() => null)
        if (!isCurrent()) return
        if (!draftResponse.ok || draftPayload?.error) {
          throw new Error(draftPayload?.error || 'Не удалось разобрать текст')
        }

        onDraft(
          draftPayload?.fields ?? {},
          transcript,
          draftPayload?.aiFilledFields ?? [],
          draftPayload?.client ?? null,
          draftPayload?.aiWarnings ?? []
        )
      } catch (error) {
        if (!isCurrent()) return
        setStatus('error')
        setErrorMessage(error?.message || 'Не удалось обработать голосовой ввод')
      }
    },
    [cleanupAudio, onDraft, onTranscript]
  )

  const startRecording = useCallback(async (generation) => {
    if (
      typeof window === 'undefined' ||
      !window.MediaRecorder ||
      !navigator?.mediaDevices?.getUserMedia
    ) {
      setStatus('error')
      setErrorMessage('Запись аудио не поддерживается в этом браузере')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!activeRef.current || generationRef.current !== generation) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      chunksRef.current = []
      startLevelMeter(stream)

      const mimeType = getPreferredAudioMimeType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      recorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (activeRef.current && generationRef.current === generation && event.data?.size > 0)
          chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        if (!activeRef.current || generationRef.current !== generation) return
        const audioBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })
        recorderRef.current = null
        chunksRef.current = []
        processAudioBlob(audioBlob, generation)
      }

      recorder.start()
      setStatus('listening')
    } catch (error) {
      if (!activeRef.current || generationRef.current !== generation) return
      cleanupAudio()
      setStatus('error')
      setErrorMessage(
        error?.name === 'NotAllowedError'
          ? 'Доступ к микрофону запрещён'
          : 'Не удалось запустить запись'
      )
    }
  }, [cleanupAudio, processAudioBlob, startLevelMeter])

  const stopRecording = useCallback(() => {
    if (status !== 'listening') return
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
      return
    }
    cleanupAudio()
  }, [cleanupAudio, status])

  useEffect(() => {
    // Открытие оверлея запускает MediaRecorder; cleanup освобождает микрофон.
    activeRef.current = true
    const generation = ++generationRef.current
    startRecording(generation)
    return discardRecording
  }, [discardRecording, startRecording])

  const scale = status === 'listening' ? 1 + level * 0.32 : 1
  const shadowSize = status === 'listening' ? 24 + Math.round(level * 36) : 20

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 px-6 pt-6 pb-24 text-white">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Закрыть голосовой ввод"
        onClick={status === 'listening' ? undefined : cancelRecording}
      />
      <div className="relative flex max-w-sm flex-col items-center text-center">
        <button
          type="button"
          className="relative flex h-36 w-36 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-2xl transition-transform duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          style={{
            transform: `scale(${scale})`,
            boxShadow: `0 0 ${shadowSize}px rgba(255,255,255,0.35)`,
          }}
          onClick={status === 'listening' ? stopRecording : undefined}
          disabled={status === 'starting' || status === 'processing'}
          aria-label="Завершить запись"
          title="Распознать речь с помощью ИИ"
        >
          {status === 'processing' || status === 'starting' ? (
            <FontAwesomeIcon icon={faSpinner} className="h-16 w-16 animate-spin" />
          ) : status === 'error' ? (
            <FontAwesomeIcon
              icon={faExclamationTriangle}
              className="h-16 w-16 text-red-200"
            />
          ) : (
            <FontAwesomeIcon icon={faMicrophone} className="h-16 w-16" />
          )}
        </button>

        <div className="mt-8 text-3xl font-semibold">
          {status === 'listening'
            ? 'Говорите'
            : status === 'processing'
              ? 'Обрабатываю'
              : status === 'starting'
                ? 'Включаю микрофон'
                : 'Не удалось записать'}
        </div>
        <div className="mt-3 min-h-6 text-sm text-white/75">
          {status === 'listening'
            ? 'Нажмите на микрофон для завершения записи'
            : status === 'processing'
              ? onTranscript ? 'Распознаю речь' : 'Распознаю речь и готовлю черновик'
              : errorMessage}
        </div>
      </div>
      <AppButton
        variant="secondary"
        className="absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-1/2 min-h-11 min-w-28 -translate-x-1/2"
        onClick={cancelRecording}
      >
        Отмена
      </AppButton>
    </div>
  )
}

VoiceDraftOverlay.propTypes = {
  onClose: PropTypes.func.isRequired,
  onDraft: PropTypes.func,
  onTranscript: PropTypes.func,
}

export default VoiceDraftOverlay
