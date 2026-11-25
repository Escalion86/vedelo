import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLocalAiUrl, getLocalAiProvider, normalizeLocalAiTimeout, tryLocalAiProvider } from '../../server/localAiProvider.mjs'
import { getAiAnalysisProviderConfig, requestAiChatCompletion } from '../../server/aiChatCompletion.js'
import { createLoader } from './loadWithAliases.cjs'

test('local provider validates loopback URL, required chat model and timeout bounds', () => {
  assert.equal(getLocalAiProvider('analysis', { LOCAL_AI_ANALYSIS_URL: 'ftp://private.example', LOCAL_AI_ANALYSIS_MODEL: 'test' }), null)
  assert.equal(getLocalAiProvider('analysis', { LOCAL_AI_ANALYSIS_URL: 'http://127.0.0.1:18010' }), null)
  assert.equal(getLocalAiProvider('analysis', { LOCAL_AI_ANALYSIS_URL: 'http://private.example', LOCAL_AI_ANALYSIS_MODEL: 'test' }), null)
  assert.equal(getLocalAiProvider('analysis', { LOCAL_AI_ANALYSIS_URL: 'http://127.0.0.1:18010/v1', LOCAL_AI_ANALYSIS_MODEL: 'test' }).timeoutMs, 20000)
  assert.equal(buildLocalAiUrl('http://secret:password@127.0.0.1:18010/v1', '/models'), '')
  assert.equal(buildLocalAiUrl('http://127.0.0.1:18010/v1/chat/completions', '/models'), 'http://127.0.0.1:18010/v1/models')
  assert.equal(normalizeLocalAiTimeout(999), undefined)
  assert.equal(normalizeLocalAiTimeout(1000), 1000)
  assert.equal(normalizeLocalAiTimeout(120000), 120000)
  assert.equal(normalizeLocalAiTimeout(120001), undefined)
})

test('chat local configuration requires dev, explicit opt-in and a matching provider selection', () => {
  const settings = {
    aiAnalysisProvider: 'local', aiAnalysisFallbackProvider: 'aitunnel', aitunnelKey: 'cloud',
    isDeveloper: true, localAiEnabled: true, localAiBaseUrl: 'http://127.0.0.1:18010/v1/',
    localAiModel: 'my-model', localAiKey: 'local-key', localAiTimeoutMs: 1000,
    aiAnalysisModel: 'cloud-model',
  }
  assert.deepEqual(getAiAnalysisProviderConfig(settings), {
    name: 'local', kind: 'analysis', apiUrl: 'http://127.0.0.1:18010/v1/chat/completions',
    apiKey: 'local-key', model: 'my-model', timeoutMs: 1000,
  })
  assert.equal(getAiAnalysisProviderConfig({ ...settings, isDeveloper: false }).name, 'aitunnel')
  assert.equal(getAiAnalysisProviderConfig({ ...settings, localAiEnabled: false }).name, 'aitunnel')
  assert.equal(getAiAnalysisProviderConfig({ ...settings, aiAnalysisProvider: 'aitunnel' }).name, 'aitunnel')
  assert.equal(getAiAnalysisProviderConfig(settings, { allowLocal: false }).model, 'cloud-model')
})

test('three failures open the local circuit for seven minutes and allow one probe', async () => {
  const provider = { kind: 'transcription', apiUrl: 'https://circuit.example/transcribe' }
  let time = 1, calls = 0, opened = 0
  const fail = async () => { calls += 1; throw Error('offline') }
  const onOpen = () => { opened += 1 }
  for (let index = 0; index < 4; index += 1) assert.equal(await tryLocalAiProvider(provider, fail, () => time, onOpen), null)
  assert.equal(calls, 3)
  assert.equal(opened, 1)
  time += 7 * 60_000
  let release
  const probe = tryLocalAiProvider(provider, () => new Promise(resolve => { release = resolve }), () => time)
  assert.equal(await tryLocalAiProvider(provider, fail, () => time), null)
  release({ transcript: 'works' })
  assert.equal((await probe).transcript, 'works')
  assert.equal(await tryLocalAiProvider(provider, async () => 'normal', () => time), 'normal')
})

test('chat reports the actual provider and falls back from invalid local JSON', async t => {
  const values = { LOCAL_AI_ANALYSIS_URL: 'http://127.0.0.1:18010/v1/chat/completions', LOCAL_AI_ANALYSIS_MODEL: 'home', OPENAI_API_KEY: 'fixture', AI_ANALYSIS_API_URL: 'https://cloud.example/chat' }
  const original = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  Object.assign(process.env, values)
  const calls = []
  let localContent = '{"ok":true}'
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(url)
    if (url === values.LOCAL_AI_ANALYSIS_URL) {
      assert.ok(options.signal)
      assert.equal(options.redirect, 'error')
    }
    return Response.json({ choices: [{ message: { content: url === values.LOCAL_AI_ANALYSIS_URL ? localContent : '{"fallback":true}' } }] })
  })
  const request = changes => requestAiChatCompletion({ settings: {
    aiAnalysisProvider: 'local', aiAnalysisFallbackProvider: 'openai', isDeveloper: true, localAiEnabled: true, ...changes,
  }, messages: [] })
  assert.equal((await request({ isDeveloper: false })).provider, 'openai')
  assert.equal((await request({ aiAnalysisProvider: 'openai' })).provider, 'openai')
  assert.equal((await request()).provider, 'local')
  localContent = 'invalid json'
  assert.equal((await request()).provider, 'openai')
  assert.deepEqual(calls, [values.AI_ANALYSIS_API_URL, values.AI_ANALYSIS_API_URL, values.LOCAL_AI_ANALYSIS_URL, values.LOCAL_AI_ANALYSIS_URL, values.AI_ANALYSIS_API_URL])
})

test('transcription bounds local and cloud requests and reports who answered', async t => {
  const { load } = await createLoader({ '@server/aiBilling': { failPlatformAiUsage: async () => {} } })
  const { transcribeAudioBlob } = load('server/callTranscription.js')
  const localBaseUrl = 'http://127.0.0.1:18011'
  const localEndpoint = `${localBaseUrl}/v1/audio/transcriptions`
  const values = { LOCAL_AI_TRANSCRIPTION_URL: localBaseUrl, LOCAL_AI_TRANSCRIPTION_MODEL: '', OPENAI_API_KEY: 'fixture', AI_TRANSCRIPTION_API_URL: 'https://cloud.example/audio' }
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
  const warn = t.mock.method(console, 'warn', () => {})
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(url)
    assert.equal(options.body.get('file').name, 'voice.webm')
    if (url === localEndpoint) {
      assert.equal(options.redirect, 'error')
      if (!localAvailable) throw new Error('timeout')
    }
    return Response.json({ text: 'Пример' })
  })
  const request = changes => transcribeAudioBlob(new Blob(['audio']), 'voice.webm', {
    aiTranscriptionProvider: 'local', aiTranscriptionFallbackProvider: 'openai', isDeveloper: true, localAiEnabled: true, ...changes,
  }, { includeProvider: true })
  assert.equal((await request({ isDeveloper: false })).provider, 'openai')
  assert.equal((await request({ localAiEnabled: false })).provider, 'openai')
  assert.equal((await request({ aiTranscriptionProvider: 'openai' })).provider, 'openai')
  assert.deepEqual(await request(), { transcript: 'Пример', provider: 'local', model: 'gigaam' })
  localAvailable = false
  for (let attempt = 0; attempt < 4; attempt += 1) {
    assert.deepEqual(await request(), { transcript: 'Пример', provider: 'openai', model: 'whisper-1' })
  }
  const cloudEndpoint = values.AI_TRANSCRIPTION_API_URL
  assert.deepEqual(calls, [
    cloudEndpoint, cloudEndpoint, cloudEndpoint, localEndpoint,
    localEndpoint, cloudEndpoint, localEndpoint, cloudEndpoint, localEndpoint, cloudEndpoint, cloudEndpoint,
  ])
  assert.deepEqual(timeouts, [45000, 45000, 45000, 30000, 30000, 45000, 30000, 45000, 30000, 45000, 45000])
  assert.deepEqual(warn.mock.calls.map(call => call.arguments), [['[local-ai] transcription fallback', { provider: 'openai' }]])
})
