import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import { useColorScheme } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { darkPalette, lightPalette, type Palette, type ThemePreference } from './theme'

export const THEME_PREFERENCE_KEY = 'vedelo.ui.theme.preference.v1'
export type ThemePreferenceStorage = {
  read: () => Promise<string | null>
  write: (preference: ThemePreference) => Promise<void>
}
const preferenceStorage: ThemePreferenceStorage = {
  read: () => SecureStore.getItemAsync(THEME_PREFERENCE_KEY),
  write: (value) => SecureStore.setItemAsync(THEME_PREFERENCE_KEY, value),
}
const isPreference = (value: unknown): value is ThemePreference =>
  value === 'light' || value === 'dark' || value === 'system'

type ThemeContextValue = {
  palette: Palette
  preference: ThemePreference
  hydrated: boolean
  persistenceError: boolean
  persistenceStatus: 'idle' | 'saving' | 'saved' | 'error'
  setPreference: (preference: ThemePreference) => Promise<boolean>
}
const ThemeContext = createContext<ThemeContextValue>({
  palette: lightPalette,
  preference: 'light',
  hydrated: true,
  persistenceError: false,
  persistenceStatus: 'idle',
  setPreference: async () => false,
})

export const ThemeProvider = ({
  children,
  forcedMode,
  initialPreference = 'light',
  storage = preferenceStorage,
}: PropsWithChildren<{
  forcedMode?: Palette['mode']
  initialPreference?: ThemePreference
  /** null makes a preview isolated: no persisted preference is read or written. */
  storage?: ThemePreferenceStorage | null
}>) => {
  const systemMode = useColorScheme()
  const [preference, updatePreference] = useState(initialPreference)
  const [hydrated, setHydrated] = useState(!storage)
  const [persistenceStatus, setPersistenceStatus] = useState<ThemeContextValue['persistenceStatus']>('idle')
  const mounted = useRef(true)
  const revision = useRef(0)
  const writes = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    mounted.current = true
    if (!storage) return () => { mounted.current = false }
    let active = true
    const readRevision = revision.current
    setHydrated(false)
    Promise.resolve().then(() => storage.read()).then((value) => {
      if (active && revision.current === readRevision && isPreference(value)) {
        updatePreference(value)
      }
    }).catch(() => {
      if (active && revision.current === readRevision) setPersistenceStatus('error')
    }).finally(() => {
      if (active) setHydrated(true)
    })
    return () => { active = false; mounted.current = false }
  }, [storage])

  const setPreference = useCallback(async (value: ThemePreference) => {
    if (!isPreference(value) || !mounted.current) return false
    const writeRevision = ++revision.current
    updatePreference(value)
    if (!storage) return true
    setPersistenceStatus('saving')
    // Serialize writes so a slow previous write cannot win over the latest choice.
    const write = writes.current.then(() => storage.write(value)).then(() => {
      if (mounted.current && revision.current === writeRevision) setPersistenceStatus('saved')
      return true
    }).catch(() => {
      if (mounted.current && revision.current === writeRevision) setPersistenceStatus('error')
      return false
    })
    writes.current = write
    return write
  }, [storage])

  const mode = forcedMode ?? (preference === 'system' ? systemMode ?? 'light' : preference)
  const palette = mode === 'dark' ? darkPalette : lightPalette
  const value = useMemo(() => ({ palette, preference, hydrated, persistenceStatus,
    persistenceError: persistenceStatus === 'error', setPreference }),
    [palette, preference, hydrated, persistenceStatus, setPreference])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
/** Keep factories at module scope; styles are rebuilt when the palette changes. */
export const useThemeStyles = <T,>(factory: (palette: Palette) => T): T => {
  const { palette } = useTheme()
  return useMemo(() => factory(palette), [factory, palette])
}
