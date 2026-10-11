import { render } from '@testing-library/react-native'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { PageHeader } from './components'
import { ThemeProvider } from './ThemeProvider'
import app from '../../../app.json'

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon', FontAwesome5: 'Icon' }))

it('заголовок использует тот же Inter Tight, что PWA', () => {
  const screen = render(<ThemeProvider storage={null}><PageHeader title="Важное" /></ThemeProvider>)
  expect(screen.getByText('Важное')).toHaveStyle({ fontFamily: 'InterTight' })
})
it('Android включает существующий шрифт PWA для обычного, среднего, полужирного и жирного текста', () => {
  const plugin = app.expo.plugins.find(item => Array.isArray(item) && item[0] === 'expo-font') as unknown as [string, {android: {fonts: {fontFamily: string; fontDefinitions: {path: string; weight: number}[]}[]}}] | undefined
  expect(plugin).toBeDefined()
  const family = plugin![1].android.fonts.find(font => font.fontFamily === 'InterTight')!
  expect(family.fontDefinitions.map(font => font.weight)).toEqual([400, 500, 600, 700])
  for (const font of family.fontDefinitions) expect(existsSync(resolve(__dirname, '../../..', font.path))).toBe(true)
})
