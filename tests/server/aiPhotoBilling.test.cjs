const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { loadBindings, transformSync } = require('next/dist/build/swc')

async function adapter(mode = 'ok') {
  await loadBindings()
  const calls = []
  const reservation = { id: 'reservation' }
  const billing = {
    reservePlatformAiUsage: async value => { calls.push(['reserve', value]); if (mode === 'balance') throw new Error('AI_BALANCE'); return reservation },
    failPlatformAiUsage: async (value, code) => { assert.equal(value, reservation); calls.push(['refund', code]) },
    settlePlatformAiUsage: async (value, usage) => { assert.equal(value, reservation); calls.push(['settle', usage]) },
  }
  const { code } = transformSync(fs.readFileSync('server/aiChatCompletion.js', 'utf8'), { filename: 'server/aiChatCompletion.js', jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' }, module: { type: 'commonjs' } })
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', 'process', 'fetch', code)(
    name => { assert.equal(name, './aiBilling.js'); return billing }, loaded, loaded.exports,
    { env: { AITUNNEL_KEY: 'test-platform-key' } }, async (_url, options) => {
      calls.push(['fetch', JSON.parse(options.body)])
      if (mode === 'network') throw new Error('network-private-key')
      return Response.json({ choices: [{ message: { content: mode === 'empty' ? '' : '{"text":"note"}' } }], usage: { total_tokens: 123 } }, { status: mode === 'http' ? 500 : 200 })
    })
  return { ...loaded.exports, calls }
}
for (const mode of ['ok', 'network', 'http', 'empty', 'balance']) test(`platform vision billing ${mode}`, async () => {
  const { requestAiChatCompletion, calls } = await adapter(mode)
  const options = { settings: { tenantId: 'tenant-a', userId: 'user-a', aiAnalysisProvider: 'artistcrm' }, requireVision: true, feature: 'event_photo_ocr', messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,test' } }] }] }
  if (mode === 'ok') await requestAiChatCompletion(options)
  else await assert.rejects(requestAiChatCompletion(options))
  assert.equal(calls[0][0], 'reserve')
  assert.equal(calls[0][1].tenantId, 'tenant-a'); assert.equal(calls[0][1].userId, 'user-a'); assert.equal(calls[0][1].feature, 'event_draft')
  assert.deepEqual(calls.map(c => c[0]), mode === 'ok' ? ['reserve', 'fetch', 'settle'] : mode === 'balance' ? ['reserve'] : ['reserve', 'fetch', 'refund'])
})
for (const settings of [{ aiAnalysisProvider: 'deepseek', deepseekKey: 'key' }, { aiAnalysisProvider: 'artistcrm', aiAnalysisModel: 'unknown-model' }, { aiAnalysisProvider: 'unknown' }]) test(`unsupported vision ${settings.aiAnalysisProvider}/${settings.aiAnalysisModel || ''} without billing/fetch`, async () => {
  const { requestAiChatCompletion, calls } = await adapter()
  await assert.rejects(requestAiChatCompletion({ settings, messages: [], requireVision: true }), e => e.code === 'AI_VISION_UNSUPPORTED')
  assert.equal(calls.length, 0)
})
test('personal AITunnel vision uses personal key and no platform billing', async () => {
  const { requestAiChatCompletion, calls } = await adapter()
  await requestAiChatCompletion({ settings: { aiAnalysisProvider: 'aitunnel', aitunnelKey: 'personal-key' }, messages: [], requireVision: true })
  assert.deepEqual(calls.map(c => c[0]), ['fetch'])
})
