// Один mount/unmount только штатных RN hosts в VM до исходных it/hook deadlines.
// Здесь нет feature, providers, auth, fetch или продуктового API.
function initializeNativeHosts(nativeRender) {
  const React = require('react'), native = require('react-native')
  const { performance } = require('node:perf_hooks'), { trace } = require('./readiness.cjs')
  const create = React.createElement, start = performance.now()
  trace({ phase: 'platform-init-start' })
  const fixture = nativeRender(create(native.View, null,
    create(native.ScrollView, null,
      create(native.Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Native readiness' }, create(native.Text, null, 'Native readiness')),
      create(native.TextInput, { value: '', onChangeText() {} }),
      create(native.ActivityIndicator, { animating: false }),
      create(native.Switch, { value: false })),
    create(native.Modal, { visible: true, transparent: true, onRequestClose() {} }, create(native.Text, null, 'Native modal readiness'))))
  fixture.getByText('Native modal readiness')
  fixture.unmount()
  // FieldHelp restores native focus on RAF. The first findNodeHandle call lazily
  // loads the native renderer; initialize that platform seam without a feature.
  const focusStart = performance.now()
  trace({ phase: 'platform-focus-init-start' })
  native.findNodeHandle(null)
  trace({ phase: 'platform-focus-init-complete', duration: performance.now() - focusStart })
  trace({ phase: 'platform-init-complete', duration: performance.now() - start })
}
module.exports = { initializeNativeHosts }
