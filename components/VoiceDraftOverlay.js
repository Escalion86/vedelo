'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
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

const VoiceDraftOverlay = ({ onClose, onDraft }) => {
  const [status, setStatus] = useState('starting')
  const [errorMessage, setErrorMessage] = useState('')
  const [level, setLevel] = useState(0)
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const audioContextRef = useRef(null)
  const animationFrameRef = useRef(null)
  const startedRef = useRef(false)

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
    async (audioBlob) => {
      if (!audioBlob || audioBlob.size === 0) {
        setStatus('error')
        setErrorMessage('Не удалось записать аудио')
        return
      }

      setStatus('processing')
      cleanupAudio()

      try {
        const formData = new FormData()
        formData.set('audio', audioBlob, getAudioFileName(audioBlob.type || ''))

        const transcriptResponse = await fetch('/api/events/voice-transcript', {
          method: 'POST',
          body: formData,
        })
        const transcriptPayload = await transcriptResponse.json().catch(() => null)
        if (!transcriptResponse.ok || transcriptPayload?.error) {
          throw new Error(
            transcriptPayload?.error || 'Не удалось распознать голос'
          )
        }

        const transcript = String(transcriptPayload?.transcript || '').trim()
        if (!transcript) throw new Error('Не удалось распознать речь')

        const draftResponse = await fetch('/api/events/ai-draft', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text: transcript }),
        })
        const draftPayload = await draftResponse.json().catch(() => null)
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
        setStatus('error')
        setErrorMessage(error?.message || 'Не удалось обработать голосовой ввод')
      }
    },
    [cleanupAudio, onDraft]
  )

  const startRecording = useCallback(async () => {
    if (startedRef.current) return
    startedRef.current = true

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
      streamRef.current = stream
      chunksRef.current = []
      startLevelMeter(stream)

      const mimeType = getPreferredAudioMimeType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      recorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })
        recorderRef.current = null
        chunksRef.current = []
        processAudioBlob(audioBlob)
      }

      recorder.start()
      setStatus('listening')
    } catch (error) {
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startRecording()
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop()
      }
      cleanupAudio()
    }
  }, [cleanupAudio, startRecording])

  const scale = status === 'listening' ? 1 + level * 0.32 : 1
  const shadowSize = status === 'listening' ? 24 + Math.round(level * 36) : 20

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 px-6 text-white">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Закрыть голосовой ввод"
        onClick={status === 'listening' ? undefined : onClose}
      />
      <div className="relative flex max-w-sm flex-col items-center text-center">
        <button
          type="button"
          className="flex h-36 w-36 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-2xl transition-transform duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          style={{
            transform: `scale(${scale})`,
            boxShadow: `0 0 ${shadowSize}px rgba(255,255,255,0.35)`,
          }}
          onClick={status === 'listening' ? stopRecording : undefined}
          disabled={status === 'starting' || status === 'processing'}
          aria-label="Завершить запись"
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
              ? 'Распознаю речь и готовлю черновик'
              : errorMessage}
        </div>
        {status === 'error' ? (
          <button
            type="button"
            className="mt-6 cursor-pointer rounded-md border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            onClick={onClose}
          >
            Закрыть
          </button>
        ) : null}
      </div>
    </div>
  )
}

VoiceDraftOverlay.propTypes = {
  onClose: PropTypes.func.isRequired,
  onDraft: PropTypes.func.isRequired,
}

export default VoiceDraftOverlay
