import test from 'node:test'
import assert from 'node:assert/strict'
import { getLocalAiProvider, tryLocalAiProvider } from '../../server/localAiProvider.mjs'
import { requestAiChatCompletion } from '../../server/aiChatCompletion.js'
import { createLoader } from './loadWithAliases.cjs'

test('local provider requires a server endpoint and model', () => {
  assert.equal(getLocalAiProvider('analysis', { LOCAL_AI_ANALYSIS_URL: 'ftp://private.example', LOCAL_AI_ANALYSIS_MODEL: 'test' }), null)
  assert.equal(getLocalAiProvider('analysis', { LOCAL_AI_ANALYSIS_URL: 'http://private.example' }), null)
  assert.equal(getLocalAiProvider('analysis', { LOCAL_AI_ANALYSIS_URL: 'http://private.example', LOCAL_AI_ANALYSIS_MODEL: 'test' }).timeoutMs, 20000)
})

test('three failures open the local circuit for seven minutes and allow one probe', async () => {
  const provider = { kind: 'transcription', apiUrl: 'https://circuit.example/transcribe' }
  let time = 1, calls = 0
  const fail = async () => { calls += 1; throw Error('offline') }
  for (let index = 0; index < 4; index += 1) assert.equal(await tryLocalAiProvider(provider, fail, () => time), null)
  assert.equal(calls, 3)
  time += 7 * 60_000
  let release
  const probe = tryLocalAiProvider(provider, () => new Promise(resolve => { release = resolve }), () => time)
  assert.equal(await tryLocalAiProvider(provider, fail, () => time), null)
  release({ transcript: 'works' })
  assert.equal((await probe).transcript, 'works')
  assert.equal(await tryLocalAiProvider(provider, async () => 'normal', () => time), 'normal')
})

test('chat reports the actual provider and falls back from invalid local JSON', async t => {
  const values = { LOCAL_AI_ANALYSIS_URL: 'http://local.example/v1/chat/completions', LOCAL_AI_ANALYSIS_MODEL: 'home', OPENAI_API_KEY: 'fixture', AI_ANALYSIS_API_URL: 'https://cloud.example/chat' }
  const original = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  Object.assign(process.env, values)
  const calls = []
  let localContent = '{"ok":true}'
  globalThis.fetch = async (url, options) => {
    calls.push(url)
    if (url === values.LOCAL_AI_ANALYSIS_URL) assert.ok(options.signal)
    return Response.json({ choices: [{ message: { content: url === values.LOCAL_AI_ANALYSIS_URL ? localContent : '{"fallback":true}' } }] })
  }
  const request = () => requestAiChatCompletion({ settings: { aiAnalysisProvider: 'openai' }, messages: [] })
  assert.equal((await request()).provider, 'local')
  localContent = 'invalid json'
  assert.equal((await request()).provider, 'openai')
  assert.deepEqual(calls, [values.LOCAL_AI_ANALYSIS_URL, values.LOCAL_AI_ANALYSIS_URL, values.AI_ANALYSIS_API_URL])
})

test('transcription bounds local and cloud requests and reports who answered', async t => {
  const { load } = await createLoader({ '@server/aiBilling': { failPlatformAiUsage: async () => {} } })
  const { transcribeAudioBlob } = load('server/callTranscription.js')
  const values = { LOCAL_AI_TRANSCRIPTION_URL: 'http://local.example/v1/audio/transcriptions', LOCAL_AI_TRANSCRIPTION_MODEL: 'home', OPENAI_API_KEY: 'fixture', AI_TRANSCRIPTION_API_URL: 'https://cloud.example/audio' }
  const original = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
  const timeouts = [], calls = []
  t.mock.method(AbortSignal, 'timeout', timeout => { timeouts.push(timeout); return new AbortController().signal })
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  Object.assign(process.env, values)
  let localAvailable = true
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(url)
    assert.equal(options.body.get('file').name, 'voice.webm')
    if (url === values.LOCAL_AI_TRANSCRIPTION_URL && !localAvailable) throw new Error('timeout')
    return Response.json({ text: 'Пример' })
  })
  const request = () => transcribeAudioBlob(new Blob(['audio']), 'voice.webm', { aiTranscriptionProvider: 'openai' }, { includeProvider: true })
  assert.deepEqual(await request(), { transcript: 'Пример', provider: 'local', model: 'home' })
  localAvailable = false
  assert.deepEqual(await request(), { transcript: 'Пример', provider: 'openai', model: 'whisper-1' })
  assert.deepEqual(calls, [values.LOCAL_AI_TRANSCRIPTION_URL, values.LOCAL_AI_TRANSCRIPTION_URL, values.AI_TRANSCRIPTION_API_URL])
  assert.deepEqual(timeouts, [30000, 30000, 45000])
})
