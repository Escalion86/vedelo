import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import * as SystemUI from 'expo-system-ui'
import { useTheme } from './ThemeProvider'

// Последовательная очередь защищает фон native root от позднего ответа,
// в том числе при повторном монтировании. Отказ не блокирует следующий выбор.
let backgroundWrites: Promise<void> = Promise.resolve()

export const ThemeSystemUI = () => {
  const { palette } = useTheme()
  useEffect(() => {
    let active = true
    backgroundWrites = backgroundWrites.then(async () => {
      if (active) await SystemUI.setBackgroundColorAsync(palette.canvas)
    }).catch(() => undefined)
    return () => { active = false }
  }, [palette.canvas])

  // Edge-to-edge: фон рисуют root/Screen, StatusBar задаёт только цвет значков.
  return <StatusBar style={palette.mode === 'dark' ? 'light' : 'dark'} />
}
