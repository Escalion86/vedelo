'use strict'
// Adapt the existing E network/session fixture without editing the E scope.
// New stageJ behavioral tests use real tokenStore/client/cache instead.
const path = require('node:path')
const Module = require('node:module')
const { createHash } = require('node:crypto')
const { readFileSync } = require('node:fs')
const fixtureHash = createHash('sha256')
  .update(readFileSync(__filename))
  .digest('hex')
const mobile = path.resolve(__dirname, '../../../..')
const transformer = Module.createRequire(mobile + '/package.json')(
  'babel-jest'
).createTransformer()
module.exports = {
  getCacheKey(source, filename, options) {
    // In-memory fixture edits must invalidate previously compiled E tests too.
    return createHash('sha256')
      .update(transformer.getCacheKey(source, filename, options))
      .update(fixtureHash)
      .digest('hex')
  },
  process(source, filename, options) {
    if (filename.endsWith('/features/events/integration.stageE.test.tsx')) {
      source = source
        .replace(
          "await screen.findByTestId('event-client-review-section');await screen.findByText('Принятое КП')",
          "await screen.findByTestId('event-client-review-section');await act(async()=>{});await screen.findByText('Принятое КП')"
        )
        .replace(
          'const mockRequest=jest.fn()',
          `
// Bootstrap native hosts before scenario deadlines: cold Jest/Babel native
// initialization must not consume the first integration test's 30s budget.
const stageJNative = require('react-native')
const stageJNativeFixture = render(React.createElement(stageJNative.View, null,
  React.createElement(stageJNative.ScrollView, null,
    React.createElement(stageJNative.Pressable, null,
      React.createElement(stageJNative.Text, null, 'Native fixture')),
    React.createElement(stageJNative.ActivityIndicator, { animating: false }),
    React.createElement(stageJNative.TextInput, { value: '' }))))
stageJNativeFixture.unmount()
const mockRequest=jest.fn()`
        )
        .replace(
          'getStoredUser:async()=>mockUser}))',
          "getStoredUser:async()=>mockUser,getAccessToken:async()=> 'fixture-credential',subscribeAuthSession:()=>()=>{}}))"
        )
        .replace(
          'request:(...a:any[])=>mockRequest(...a)',
          'request:(p:string,o:any)=>mockRequest(p,o?.method?{method:o.method,skipRefresh:o.skipRefresh,...(o.body!==undefined?{body:o.body}:{})}:undefined)'
        )
    }
    return transformer.process(source, filename, options)
  },
}
