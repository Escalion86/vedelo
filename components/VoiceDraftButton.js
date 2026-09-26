'use client'

import { useState, useRef, useCallback } from 'react'
import PropTypes from 'prop-types'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faMicrophone,
  faMicrophoneSlash,
  faSpinner,
  faCircleCheck,
  faExclamationTriangle,
} from '@fortawesome/free-solid-svg-icons'

/**
 * VoiceDraftButton — кнопка голосового ввода для быстрого создания события.
 *
 * Записывает аудио через MediaRecorder, отправляет на серверную транскрибацию,
 * затем отправляет распознанный текст на API для ИИ-автозаполнения.
 *
 * Пропсы:
 *   onDraft(fields)  — вызывается при получении полей от сервера.
 *   disabled         — блокирует кнопку.
 *   className        — дополнительные классы для обёртки.
 */
const VoiceDraftButton = ({ onDraft, disabled, className }) => {
  const [status, setStatus] = useState('idle') // idle | listening | processing | success | error | unsupported
  const [errorMessage, setErrorMessage] = useState('')
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])

  const recordingSupported =
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    Boolean(navigator?.mediaDevices?.getUserMedia)

  const getPreferredAudioMimeType = useCallback(() => {
    if (!recordingSupported) return ''
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/mpeg',
    ]
    return (
      candidates.find((type) => window.MediaRecorder.isTypeSupported(type)) ||
      ''
    )
  }, [recordingSupported])

  const getAudioFileName = useCallback((mimeType) => {
    if (mimeType.includes('mp4')) return 'voice-draft.mp4'
    if (mimeType.includes('mpeg')) return 'voice-draft.mp3'
    return 'voice-draft.webm'
  }, [])

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks?.().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const handleAudioBlob = useCallback(
    async (audioBlob) => {
      if (!audioBlob || audioBlob.size === 0) {
        setStatus('error')
        setErrorMessage('Не удалось записать аудио')
        return
      }

      setStatus('processing')

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

        const fields = draftPayload?.fields ?? {}
        setStatus('success')
        setTimeout(() => setStatus('idle'), 2000)
        if (onDraft)
          onDraft(
            fields,
            transcript,
            draftPayload?.aiFilledFields ?? [],
            draftPayload?.client ?? null,
            draftPayload?.aiWarnings ?? []
          )
      } catch (err) {
        setStatus('error')
        setErrorMessage(err?.message || 'Ошибка при обработке голоса')
        console.error('[VoiceDraftButton] voice draft error:', err)
      } finally {
        cleanupStream()
      }
    },
    [cleanupStream, getAudioFileName, onDraft]
  )

  const handleStart = useCallback(async () => {
    if (disabled || status !== 'idle') return

    if (!recordingSupported) {
      setStatus('unsupported')
      setErrorMessage('Запись аудио не поддерживается в этом браузере')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []

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
        handleAudioBlob(audioBlob)
      }

      setStatus('listening')
      setErrorMessage('')
      recorder.start()
    } catch (err) {
      setStatus('error')
      cleanupStream()
      setErrorMessage(
        err?.name === 'NotAllowedError'
          ? 'Доступ к микрофону запрещён'
          : 'Не удалось запустить запись'
      )
      console.error('[VoiceDraftButton] recording start error:', err)
    }
  }, [
    cleanupStream,
    disabled,
    getPreferredAudioMimeType,
    handleAudioBlob,
    recordingSupported,
    status,
  ])

  const handleStop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
  }, [])

  if (!recordingSupported) {
    return (
      <div className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
        <button
          type="button"
          disabled
          className="inline-flex items-center px-3 py-2 text-sm text-gray-400 bg-gray-100 border border-gray-200 rounded-md cursor-not-allowed"
          title="Запись аудио не поддерживается этим браузером"
        >
          <FontAwesomeIcon icon={faMicrophoneSlash} className="w-4 h-4 mr-1.5" />
          Голосовой ввод
        </button>
      </div>
    )
  }

  // Кнопка с разными состояниями
  const buttonConfig = {
    idle: {
      icon: faMicrophone,
      label: 'Голосовой ввод',
      className: 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100 active:bg-blue-200',
    },
    listening: {
      icon: faMicrophone,
      label: 'Говорите...',
      className: 'text-red-700 bg-red-50 border-red-300 animate-pulse',
    },
    processing: {
      icon: faSpinner,
      label: 'Обработка...',
      className: 'text-amber-700 bg-amber-50 border-amber-200',
    },
    success: {
      icon: faCircleCheck,
      label: 'Готово!',
      className: 'text-green-700 bg-green-50 border-green-200',
    },
    error: {
      icon: faExclamationTriangle,
      label: 'Ошибка',
      className: 'text-red-700 bg-red-50 border-red-200',
    },
  }

  const config = buttonConfig[status] || buttonConfig.idle
  const isInteractive = status === 'idle' || status === 'listening' || status === 'error'

  return (
    <div className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <button
        type="button"
        disabled={disabled || !isInteractive}
        onClick={() => {
          if (status === 'idle') handleStart()
          else if (status === 'listening') handleStop()
          else if (status === 'error') {
            setStatus('idle')
            setErrorMessage('')
          }
        }}
        className={`inline-flex items-center px-3 py-2 text-sm font-medium border rounded-md transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        } ${isInteractive ? 'cursor-pointer' : 'cursor-default'} ${config.className}`}
        title={errorMessage || config.label}
      >
        <FontAwesomeIcon
          icon={config.icon}
          className={`w-4 h-4 mr-1.5 ${status === 'processing' ? 'animate-spin' : ''}`}
        />
        {config.label}
      </button>
      {status === 'error' && errorMessage && (
        <span className="text-xs text-red-600 max-w-[200px] truncate">{errorMessage}</span>
      )}
    </div>
  )
}

VoiceDraftButton.propTypes = {
  onDraft: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  className: PropTypes.string,
}

export default VoiceDraftButton
