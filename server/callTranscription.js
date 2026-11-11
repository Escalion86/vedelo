import {
  failPlatformAiUsage,
  reservePlatformAiUsage,
  settlePlatformAiUsage,
} from '@server/aiBilling'
import { getLocalAiProvider, tryLocalAiProvider } from './localAiProvider.mjs'

const TRANSCRIPTION_PROVIDERS = Object.freeze({
  artistcrm: {
    apiUrl: 'https://api.aitunnel.ru/v1/audio/transcriptions',
    apiKeyEnv: 'AITUNNEL_KEY',
    modelEnv: 'AITUNNEL_TRANSCRIPTION_MODEL',
    defaultModel: 'whisper-1',
  },
  openai: {
    apiUrl: 'https://api.openai.com/v1/audio/transcriptions',
    apiKeyEnv: 'OPENAI_API_KEY',
    modelEnv: 'OPENAI_TRANSCRIPTION_MODEL',
    defaultModel: 'whisper-1',
  },
  aitunnel: {
    apiUrl: 'https://api.aitunnel.ru/v1/audio/transcriptions',
    apiKeyEnv: 'AITUNNEL_KEY',
    modelEnv: 'AITUNNEL_TRANSCRIPTION_MODEL',
    defaultModel: 'whisper-1',
  },
})

const MAX_AUDIO_BYTES = 25 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 15000
const CLOUD_TIMEOUT_MS = 45000

const getTranscriptionProviderConfig = (settings = {}) => {
  const providerName = String(
    settings.aiTranscriptionProvider ||
      process.env.AI_TRANSCRIPTION_PROVIDER ||
      'aitunnel'
  )
    .trim()
    .toLowerCase()
  const provider = TRANSCRIPTION_PROVIDERS[providerName]
  if (!provider) {
    return {
      name: providerName,
      error: 'TRANSCRIPTION_PROVIDER_UNSUPPORTED',
    }
  }
  return {
    name: providerName,
    apiUrl: process.env.AI_TRANSCRIPTION_API_URL || provider.apiUrl,
    apiKey:
      providerName === 'aitunnel'
        ? settings.aitunnelKey || ''
        : process.env[provider.apiKeyEnv],
    model:
      settings.aiTranscriptionModel ||
      process.env[provider.modelEnv] ||
      provider.defaultModel,
  }
}

export const isCallTranscriptionConfigured = (settings = {}) => {
  const provider = getTranscriptionProviderConfig(settings)
  return settings.aiIntegrationEnabled !== false &&
    Boolean(getLocalAiProvider('transcription') || (!provider.error && provider.apiKey))
}

const getFileNameFromUrl = (url) => {
  try {
    const parsed = new URL(url)
    const name = parsed.pathname.split('/').filter(Boolean).pop()
    return name || 'recording.mp3'
  } catch (error) {
    return 'recording.mp3'
  }
}

const fetchRecordingBlob = async (recordingUrl) => {
  const response = await fetch(recordingUrl, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
  if (!response.ok) {
    throw new Error(`RECORDING_DOWNLOAD_FAILED:${response.status}`)
  }

  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength > MAX_AUDIO_BYTES) {
    throw new Error('RECORDING_TOO_LARGE')
  }

  const arrayBuffer = await response.arrayBuffer()
  if (arrayBuffer.byteLength > MAX_AUDIO_BYTES) {
    throw new Error('RECORDING_TOO_LARGE')
  }

  const contentType = response.headers.get('content-type') || 'audio/mpeg'
  return new Blob([arrayBuffer], { type: contentType })
}

const transcribeBlobWithOpenAiCompatible = async ({
  provider,
  audioBlob,
  fileName,
  settings = {},
  feature = 'call_transcription',
  operationId,
  groupId = '',
}) => {
  let reservation = null
  if (provider.name === 'artistcrm') {
    reservation = await reservePlatformAiUsage({
      tenantId: settings.tenantId,
      userId: settings.userId,
      feature,
      model: provider.model,
      operationId,
      groupId,
    })
  }
  const formData = new FormData()
  formData.set('model', provider.model)
  formData.set('language', 'ru')
  formData.set('response_format', 'json')
  formData.set('file', audioBlob, fileName || 'recording.webm')

  let response
  let payload
  try {
    response = await fetch(provider.apiUrl, {
      method: 'POST',
      headers: provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {},
      signal: AbortSignal.timeout(provider.timeoutMs || CLOUD_TIMEOUT_MS),
      ...(provider.name === 'local' ? { redirect: 'error' } : {}),
      body: formData,
    })
    payload = await response.json().catch(() => null)
  } catch (error) {
    await failPlatformAiUsage(reservation, 'AI_PROVIDER_NETWORK_FAILED')
    throw error
  }

  if (!response.ok) {
    await failPlatformAiUsage(reservation, `AI_PROVIDER_HTTP_${response.status}`)
    throw new Error(`TRANSCRIPTION_HTTP_${response.status}`)
  }

  const transcript = typeof payload?.text === 'string' ? payload.text.trim() : ''
  if (!transcript) {
    await failPlatformAiUsage(reservation, 'TRANSCRIPTION_EMPTY')
    throw new Error('TRANSCRIPTION_EMPTY')
  }
  if (reservation) await settlePlatformAiUsage(reservation, payload?.usage)
  return { transcript, provider: provider.name, model: provider.model }
}

export const transcribeAudioBlob = async (
  audioBlob,
  fileName = 'recording.webm',
  settings = {},
  options = {}
) => {
  if (!audioBlob) throw new Error('AUDIO_FILE_REQUIRED')
  if (audioBlob.size > MAX_AUDIO_BYTES) throw new Error('RECORDING_TOO_LARGE')

  if (settings.aiIntegrationEnabled === false) throw new Error('TRANSCRIPTION_API_KEY_REQUIRED')
  const send = (provider) => transcribeBlobWithOpenAiCompatible({ ...options, provider, audioBlob, fileName, settings })
  let result = await tryLocalAiProvider(getLocalAiProvider('transcription'), send)
  if (!result) {
    const cloud = getTranscriptionProviderConfig(settings)
    if (cloud.error) throw new Error(cloud.error)
    if (!cloud.apiKey) throw new Error('TRANSCRIPTION_API_KEY_REQUIRED')
    result = await send(cloud)
  }

  return options.includeProvider ? result : result.transcript
}

export const transcribeCallRecording = async (
  recordingUrl,
  settings = {},
  options = {}
) => {
  if (!recordingUrl) throw new Error('RECORDING_URL_REQUIRED')

  if (!isCallTranscriptionConfigured(settings)) throw new Error('TRANSCRIPTION_API_KEY_REQUIRED')
  return transcribeAudioBlob(await fetchRecordingBlob(recordingUrl), getFileNameFromUrl(recordingUrl), settings, options)
}
