const releaseVariables = {
  'ru.escalion.vedelo': 'ANDROID_APK_RELEASE',
  'ru.escalion.vedelo.dev': 'ANDROID_DEV_APK_RELEASE',
}

const downloadHosts = new Set(['vedelo.ru', 'cloud.escalion.ru'])
const headers = { 'Cache-Control': 'no-store' }

export const GET = async (req) => {
  const { searchParams } = new URL(req.url)
  const packageName = searchParams.get('packageName')
  const channel = searchParams.get('channel')
  if (
    !Object.hasOwn(releaseVariables, packageName) ||
    (channel !== null && (channel !== 'eas-apk' || packageName !== 'ru.escalion.vedelo'))
  ) {
    return Response.json(
      { success: false, error: 'Неизвестный канал обновлений Android' },
      { status: 400, headers }
    )
  }

  const releaseVariable = channel === 'eas-apk'
    ? 'ANDROID_EAS_APK_RELEASE'
    : releaseVariables[packageName]
  const configuredRelease = process.env[releaseVariable]?.trim()
  if (!configuredRelease) {
    return Response.json({ success: true, data: null }, { headers })
  }

  try {
    const release = JSON.parse(configuredRelease)
    const { versionName, versionCode, downloadUrl } = release
    if (
      release.packageName === packageName &&
      typeof versionName === 'string' &&
      /^[\w.-]{1,48}$/.test(versionName) &&
      Number.isInteger(versionCode) &&
      versionCode > 0 &&
      versionCode <= 2100000000 &&
      typeof downloadUrl === 'string' &&
      downloadUrl.length <= 2048
    ) {
      const url = new URL(downloadUrl)
      if (
        url.protocol === 'https:' &&
        downloadHosts.has(url.hostname) &&
        !url.username &&
        !url.password &&
        !url.port &&
        !url.hash
      ) {
        return Response.json(
          { success: true, data: { packageName, versionName, versionCode, downloadUrl: url.href } },
          { headers }
        )
      }
    }
  } catch {
    // Details of the invalid server configuration stay private.
  }

  return Response.json(
    { success: false, error: 'Сведения об обновлении временно недоступны' },
    { status: 503, headers }
  )
}
