import { useEffect, useRef, useState } from 'react'
import { Linking, Platform, StyleSheet, Text } from 'react-native'
import * as Application from 'expo-application'
import Constants from 'expo-constants'
import { Button, Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { typography, type Palette } from '../../shared/ui/theme'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import { checkAppUpdate, isVedeloAndroidPackage, parseNativeVersionCode, type AppUpdateResult } from './appUpdate'

type UpdateState = AppUpdateResult | { kind: 'idle' | 'checking' | 'error' }

export const AppUpdateSection = () => {
  const [update, setUpdate] = useState<UpdateState>({ kind: 'idle' })
  const [linkError, setLinkError] = useState('')
  const [opening, setOpening] = useState(false)
  const request = useRef<AbortController | null>(null)
  const linkInFlight = useRef(false)
  const styles = useThemeStyles(createStyles)
  const packageName = Application.applicationId
  const installedCode = parseNativeVersionCode(Application.nativeBuildVersion)
  const channel = Constants.expoConfig?.extra?.androidUpdateChannel
  const isPlay = channel === 'play'

  useEffect(() => () => {
    request.current?.abort()
    request.current = null
  }, [])

  if (Platform.OS !== 'android' || !isVedeloAndroidPackage(packageName)) return null

  const check = async () => {
    if (installedCode === null || request.current || linkInFlight.current) return
    const controller = new AbortController()
    request.current = controller
    const timeout = setTimeout(() => controller.abort(), 10_000)
    setLinkError('')
    setUpdate({ kind: 'checking' })
    try {
      const result = await checkAppUpdate(packageName, installedCode, controller.signal, channel === 'eas-apk' ? channel : undefined)
      if (request.current === controller) setUpdate(result)
    } catch {
      if (request.current === controller) setUpdate({ kind: 'error' })
    } finally {
      clearTimeout(timeout)
      if (request.current === controller) request.current = null
    }
  }

  const open = async (url: string, errorMessage: string) => {
    if (linkInFlight.current) return
    linkInFlight.current = true
    setOpening(true)
    setLinkError('')
    try {
      await Linking.openURL(url)
    } catch {
      setLinkError(errorMessage)
    } finally {
      linkInFlight.current = false
      setOpening(false)
    }
  }

  const installedVersion = [
    Application.nativeApplicationVersion ? `Версия ${Application.nativeApplicationVersion}` : '',
    installedCode !== null ? `сборка ${installedCode}` : '',
  ].filter(Boolean).join(' · ')

  return <Surface testID="settings-app-update">
    <SectionTitle>Обновление приложения</SectionTitle>
    {installedVersion ? <Text style={styles.hint}>{installedVersion}</Text> : null}
    {linkError ? <Notice tone="danger" message={linkError} /> : null}
    {isPlay ? <Button title="Открыть Google Play" variant="secondary" loading={opening} onPress={() => void open(
      `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName)}`, 'Не удалось открыть Google Play. Попробуйте ещё раз.'
    )} /> : <>
      {installedCode === null ? <Notice tone="warning" message="Не удалось определить номер установленной сборки." /> : null}
      {update.kind === 'error' ? <Notice tone="warning" message="Не удалось проверить обновление. Проверьте подключение и попробуйте ещё раз." /> : null}
      {update.kind === 'unpublished' ? <Notice message="Обновление пока не опубликовано." /> : null}
      {update.kind === 'current' ? <Notice tone="success" message="У вас актуальная версия." /> : null}
      {update.kind === 'available' ? <>
        <Notice tone="success" message={`Доступна версия ${update.release.versionName}.`} />
        <Button title="Скачать APK" loading={opening} onPress={() => void open(update.release.downloadUrl, 'Не удалось открыть ссылку на APK. Попробуйте ещё раз.')} />
        <Text style={styles.hint}>После скачивания откройте файл и подтвердите обновление в Android.</Text>
      </> : null}
      <Button title={update.kind === 'error' ? 'Повторить проверку' : 'Проверить обновление'} variant="secondary"
        loading={update.kind === 'checking'} loadingTitle="Проверяем…" disabled={installedCode === null || opening} onPress={() => void check()} />
    </>}
  </Surface>
}

const createStyles = (palette: Palette) => StyleSheet.create({
  hint: { fontFamily: typography.fontFamily, color: palette.cardMuted, fontSize: 13, lineHeight: 18 },
})
