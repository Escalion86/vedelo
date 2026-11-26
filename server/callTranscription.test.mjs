import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// Проверка конфигурации не обращается к биллингу или БД. Алиас Next.js
// подменяется только в этом тестовом процессе; неожиданный вызов упадёт.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@server/aiBilling') {
      return {
        url:
          'data:text/javascript,' +
          encodeURIComponent(`
          const unexpected = () => { throw new Error('Unexpected billing call') }
          export { unexpected as failPlatformAiUsage, unexpected as reservePlatformAiUsage, unexpected as settlePlatformAiUsage }
        `),
        shortCircuit: true,
      }
    }
    return nextResolve(specifier, context)
  },
})
const { isCallTranscriptionConfigured, transcribeAudioBlob } = await import('./callTranscription.js')
hooks.deregister()

test('detects configured AITunnel transcription from tenant settings', () => {
  assert.equal(
    isCallTranscriptionConfigured({
      aiTranscriptionProvider: 'aitunnel',
      aitunnelKey: 'tenant-api-key',
    }),
    true
  )
})

test('returns false when transcription API key is missing', () => {
  const previousKey = process.env.AITUNNEL_KEY
  const previousProvider = process.env.AI_TRANSCRIPTION_PROVIDER
  delete process.env.AITUNNEL_KEY
  delete process.env.AI_TRANSCRIPTION_PROVIDER

  try {
    assert.equal(
      isCallTranscriptionConfigured({
        aiTranscriptionProvider: 'aitunnel',
        aitunnelKey: '',
      }),
      false
    )
  } finally {
    if (previousKey === undefined) delete process.env.AITUNNEL_KEY
    else process.env.AITUNNEL_KEY = previousKey
    if (previousProvider === undefined)
      delete process.env.AI_TRANSCRIPTION_PROVIDER
    else process.env.AI_TRANSCRIPTION_PROVIDER = previousProvider
  }
})

test('returns false for unsupported transcription provider', () => {
  assert.equal(
    isCallTranscriptionConfigured({
      aiTranscriptionProvider: 'unknown-provider',
      aitunnelKey: 'tenant-api-key',
    }),
    false
  )
})

test('hints Russian CRM vocabulary only for cloud Whisper voice drafts', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ text: 'Задаток двадцать тысяч.' }))
  const audio = new Blob(['audio'], { type: 'audio/mp4' })
  const settings = { aiTranscriptionProvider: 'aitunnel', aiTranscriptionModel: 'whisper-1', aitunnelKey: 'fixture' }
  const voiceOptions = { feature: 'voice_transcription', includeProvider: true }

  assert.deepEqual(await transcribeAudioBlob(audio, 'voice.m4a', settings, voiceOptions), {
    transcript: 'Задаток двадцать тысяч.', provider: 'aitunnel', model: 'whisper-1',
  })
  await transcribeAudioBlob(audio, 'call.m4a', settings)
  await transcribeAudioBlob(audio, 'voice.m4a', { ...settings, aiTranscriptionModel: 'custom-stt' }, voiceOptions)

  const [voice, call, custom] = fetchMock.mock.calls.map(({ arguments: [, request] }) => request.body)
  assert.equal(voice.get('language'), 'ru')
  assert.equal(voice.get('file').name, 'voice.m4a')
  assert.equal(voice.get('file').type, 'audio/mp4')
  assert.match(voice.get('prompt'), /задаток/iu)
  assert.doesNotMatch(voice.get('prompt'), /редактир|измен|созда/iu)
  assert.equal(call.has('prompt'), false)
  assert.equal(custom.has('prompt'), false)
})
