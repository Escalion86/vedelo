import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { getTenantAiSettings } from '@server/aiSettings'
import { transcribeAudioBlob } from '@server/callTranscription'
import getUserTariffAccess from '@server/getUserTariffAccess'
import {
  getAiBalanceErrorMessage,
  isAiBalanceError,
} from '@server/aiBilling'

const MAX_AUDIO_BYTES = 25 * 1024 * 1024
const FU02_ERRORS = {
  FU02_TRANSCRIPTION_NOT_CONFIGURED: 'Укажите адрес распознавания аудио Fu02 в настройках ИИ.',
  FU02_TRANSCRIPTION_UNAVAILABLE: 'Распознавание Fu02 сейчас недоступно. Повторите запрос или выберите «ИИ Ведело».',
}

export async function POST(request) {
  try {
    const { tenantId, user } = await getRequestContext(request)
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Неавторизованный доступ' },
        { status: 401 }
      )
    }

    await dbConnect()
    const tariffAccess = await getUserTariffAccess(user?._id)
    if (!tariffAccess?.allowAi) {
      return NextResponse.json(
        { success: false, error: 'Голосовой ввод доступен только в тарифе с ИИ' },
        { status: 403 }
      )
    }

    const formData = await request.formData()
    const audioFile = formData.get('audio')

    if (!audioFile || typeof audioFile.arrayBuffer !== 'function') {
      return NextResponse.json(
        { success: false, error: 'Аудиофайл не передан' },
        { status: 400 }
      )
    }

    if (audioFile.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Аудиофайл слишком большой' },
        { status: 413 }
      )
    }

    const aiSettings = await getTenantAiSettings(tenantId, { user })
    const { transcript, provider, model } = await transcribeAudioBlob(
      audioFile,
      audioFile.name || 'voice-draft.webm',
      aiSettings,
      { feature: 'voice_transcription', includeProvider: true }
    )

    return NextResponse.json({ success: true, transcript, provider, model })
  } catch (error) {
    if (Object.hasOwn(FU02_ERRORS, error?.message)) {
      return NextResponse.json({ success: false, error: FU02_ERRORS[error.message] }, { status: 503 })
    }
    const message =
      isAiBalanceError(error)
        ? getAiBalanceErrorMessage(error)
        : error?.message === 'TRANSCRIPTION_API_KEY_REQUIRED'
        ? 'Не настроен провайдер распознавания аудио'
        : error?.message === 'TRANSCRIPTION_EMPTY'
          ? 'Не удалось распознать речь'
          : 'Не удалось обработать голосовой ввод'

    console.error('[events/voice-transcript] failed', {
      code: isAiBalanceError(error) ? 'AI_BALANCE' : 'TRANSCRIPTION_FAILED',
    })

    return NextResponse.json(
      { success: false, error: message },
      { status: isAiBalanceError(error) ? 402 : 500 }
    )
  }
}
