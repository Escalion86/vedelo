const { withAppBuildGradle, withAndroidManifest, withMainApplication, withProjectBuildGradle } = require('@expo/config-plugins')
// Native components are in a local Expo module, discovered by Expo autolinking.
// Keep the only manifest conflict reproducible after prebuild --clean.
module.exports = function withVedeloDevice(config) {
  config.android = config.android || {}
  config.android.blockedPermissions = (config.android.blockedPermissions || []).filter(permission => permission !== 'android.permission.SYSTEM_ALERT_WINDOW')
  config = withAndroidManifest(config, mod => {
    const manifest = mod.modResults.manifest
    // Incremental prebuild retains old tools:node="remove" entries unless removed explicitly.
    manifest['uses-permission'] = (manifest['uses-permission'] || []).filter(item => item.$?.['android:name'] !== 'android.permission.SYSTEM_ALERT_WINDOW')
    manifest['uses-permission'].push({ $: { 'android:name': 'android.permission.SYSTEM_ALERT_WINDOW' } })
    const application = manifest.application[0]
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools'
    application.service = (application.service || []).filter(item => item.$?.['android:name'] !== 'expo.modules.notifications.service.ExpoFirebaseMessagingService')
    application.service.push({ $: { 'android:name': 'expo.modules.notifications.service.ExpoFirebaseMessagingService', 'tools:node': 'remove' } })
    application['meta-data'] = (application['meta-data'] || []).filter(item => item.$?.['android:name'] !== 'vedelo.rustore.project_id')
    const projectId = process.env.APP_VARIANT === 'development' ? process.env.RUSTORE_PUSH_PROJECT_ID_DEV : process.env.RUSTORE_PUSH_PROJECT_ID
    if (projectId) {
      if (!/^[\w-]{1,150}$/.test(projectId)) throw new Error('Invalid RuStore project ID')
      application['meta-data'].push({ $: { 'android:name': 'vedelo.rustore.project_id', 'android:value': projectId } })
    }
    return mod
  })
  config = withMainApplication(config, mod => {
    const call = 'ru.escalion.vedelo.device.VedeloPush.initialize(this)'
    if (!mod.modResults.contents.includes(call)) mod.modResults.contents = mod.modResults.contents.replace('super.onCreate()', `super.onCreate()\n    ${call}`)
    return mod
  })
  config = withProjectBuildGradle(config, mod => {
    const repository = 'https://nexus-external.rustore.ru/repository/maven-rustore-exposed/'
    if (!mod.modResults.contents.includes(repository)) {
      const target = /allprojects\s*\{\s*repositories\s*\{/
      if (!target.test(mod.modResults.contents)) throw new Error('Cannot configure RuStore Maven repository')
      mod.modResults.contents = mod.modResults.contents.replace(target, match => `${match}\n    maven { url '${repository}' }`)
    }
    return mod
  })
  // The side-by-side device prototype needs no Firebase project or release key.
  // Remove a stale plugin left by a previous production prebuild, too.
  if (process.env.APP_VARIANT === 'development' && process.env.VEDELO_NATIVE_PROTOTYPE === '1') {
    config = withAppBuildGradle(config, mod => {
      mod.modResults.contents = mod.modResults.contents.replace(/^apply plugin: ['"]com\.google\.gms\.google-services['"]\s*$/gm, '')
      return mod
    })
  }
  return config
}
