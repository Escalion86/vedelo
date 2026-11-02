import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { AppState, Platform, View } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import * as LocalAuthentication from 'expo-local-authentication'
import { useAuth } from './AuthProvider'
import { device, deviceSession } from '../native/device'
import { Button, Notice, PageHeader, Screen } from '../ui/components'

const key = 'vedelo_app_lock_enabled'
type LockContext = { enabled: boolean; locked: boolean; setEnabled: (enabled: boolean) => Promise<void> }
const Context = createContext<LockContext>({ enabled: false, locked: false, setEnabled: async () => {} })
export const useAppLock = () => useContext(Context)
const updateNativeLock = (locked: boolean) => {
  const session = deviceSession()
  if (device && session) device.setAppLockState(session.generation, locked)
}
const confirmNativeAuthentication = () => {
  if (!device?.confirmAppAuthentication) return true
  const session = deviceSession()
  return !!session && device.confirmAppAuthentication(session.generation)
}
export const AppLockProvider = ({ children }: PropsWithChildren) => {
  const { authenticated, user } = useAuth()
  const [enabled, setEnabledState] = useState(false), [ready, setReady] = useState(false), [locked, setLocked] = useState(true)
  const [background, setBackground] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const identity = authenticated ? JSON.stringify([user?._id, user?.tenantId]) : ''
  const inFlight = useRef(false), hiddenAt = useRef<number | null>(null), alive = useRef(true), userId = useRef(identity)
  // Lifecycle callbacks can arrive in one React batch. Keep the security state
  // synchronous so a duplicate resume cannot undo the first callback's lock.
  const enabledRef = useRef(false), lockedRef = useRef(true), backgroundRef = useRef(false)
  const setLockState = useCallback((next: boolean) => { lockedRef.current = next; setLocked(next) }, [])
  const reconcileVisibility = useCallback(() => {
    let visible = true
    try {
      const native = device?.getAppLockStatus?.()
      if (native && native.generation === deviceSession()?.generation) {
        visible = native.visible
        if (enabledRef.current && native.requiresAuthentication) setLockState(true)
      }
    } catch { setLockState(true) }
    if (enabledRef.current && visible && hiddenAt.current !== null && Date.now() - hiddenAt.current >= 60_000) setLockState(true)
    backgroundRef.current = !visible
    if (visible) hiddenAt.current = null
    else if (hiddenAt.current === null) hiddenAt.current = Date.now()
    setBackground(enabledRef.current && !visible)
    updateNativeLock(lockedRef.current || (enabledRef.current && !visible))
  }, [setLockState])
  userId.current = identity
  useEffect(() => {
    alive.current = true
    SecureStore.getItemAsync(key).then(value => { if (alive.current) { enabledRef.current = value === 'true'; setEnabledState(enabledRef.current); setLockState(enabledRef.current); setReady(true) } })
      .catch(() => { if (alive.current) { setError('Не удалось прочитать настройку блокировки. Перезапустите приложение.'); setReady(false) } })
    return () => { alive.current = false }
  }, [setLockState])
  const authenticate = useCallback(async () => {
    if (inFlight.current) return false
    const identity = userId.current
    const generation = deviceSession()?.generation
    inFlight.current = true; setBusy(true); setError('')
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Разблокировать Ведело', cancelLabel: 'Отмена', fallbackLabel: 'Код устройства', disableDeviceFallback: false })
      return result.success && alive.current && identity === userId.current && generation === deviceSession()?.generation
    } catch { if (alive.current) setError('Не удалось подтвердить доступ. Используйте системный код устройства.'); return false }
    finally { inFlight.current = false; if (alive.current) setBusy(false) }
  }, [])
  const unlock = async () => {
    if (await authenticate() && confirmNativeAuthentication()) {
      setLockState(false)
      hiddenAt.current = backgroundRef.current ? Date.now() : null
      if (device?.getAppLockStatus) reconcileVisibility()
      else updateNativeLock(backgroundRef.current)
    }
  }
  const setEnabled = useCallback(async (next: boolean) => {
    const identity = userId.current
    if (!await authenticate()) throw new Error('Подтверждение отменено')
    await SecureStore.setItemAsync(key, String(next))
    await device?.setPreference('biometricEnabled', next)
    if (!alive.current || identity !== userId.current) throw new Error('Сессия изменилась')
    if (!confirmNativeAuthentication()) throw new Error('Не удалось подтвердить сессию')
    enabledRef.current = next
    setEnabledState(next); setLockState(false)
    hiddenAt.current = backgroundRef.current ? Date.now() : null
    if (device?.getAppLockStatus) reconcileVisibility()
    else updateNativeLock(next && backgroundRef.current)
  }, [authenticate, setLockState, reconcileVisibility])
  useEffect(() => {
    if (ready && enabledRef.current && authenticated) { setLockState(true); updateNativeLock(true) }
    else if (ready && !enabledRef.current) updateNativeLock(false)
  }, [identity, ready, setLockState])
  useEffect(() => {
    const hide = () => {
        if (hiddenAt.current === null) hiddenAt.current = Date.now()
        backgroundRef.current = true
        if (enabledRef.current) { setBackground(true); updateNativeLock(true) }
    }
    const subscription = AppState.addEventListener('change', state => state === 'active' ? reconcileVisibility() : hide())
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', hide) : null
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', reconcileVisibility) : null
    const native = device?.getAppLockStatus ? device.addListener('appLockChanged', reconcileVisibility) : null
    return () => { subscription.remove(); blur?.remove(); focus?.remove(); native?.remove() }
  }, [reconcileVisibility])
  const blocked = authenticated && (!ready || (enabled && (locked || background)))
  return <Context.Provider value={{ enabled, locked: blocked, setEnabled }}>
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, display: blocked ? 'none' : 'flex' }} importantForAccessibility={blocked ? 'no-hide-descendants' : 'auto'}>{children}</View>
      {blocked ? <Screen><PageHeader title="Ведело заблокировано" />{error ? <Notice tone="danger" message={error} /> : null}
        <Button title="Разблокировать" disabled={busy || !ready || background} loading={busy} onPress={() => void unlock()} />
      </Screen> : null}
    </View>
  </Context.Provider>
}
