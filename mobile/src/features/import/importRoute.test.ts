import fs from 'node:fs'
import path from 'node:path'
import { getRoutes } from 'expo-router/build/getRoutes'
import { getReactNavigationConfig } from 'expo-router/build/getReactNavigationConfig'
import { getStateFromPath } from 'expo-router/build/fork/getStateFromPath'
import type { RequireContext } from 'expo-router/build/types'

it('реальный static /more/import выигрывает у legacy [section] в установленном Expo Router', () => {
  const app = path.resolve(__dirname, '../../../app')
  const keys = ['./_layout.tsx', ...fs.readdirSync(path.join(app, 'more')).filter((name) => name.endsWith('.tsx')).map((name) => `./more/${name}`)]
  const context = Object.assign((_key: string) => ({ default: () => null }), { keys: () => keys, resolve: (key: string) => key, id: 'import-route' }) as RequireContext
  const tree = getRoutes(context, { platform: 'android', ignoreEntryPoints: true, sitemap: false, notFound: false })!
  const config = getReactNavigationConfig(tree, true)
  const state = getStateFromPath('/more/import', config)!
  expect(state.routes[state.routes.length - 1].name).toBe('more/import')
  expect(tree.children.find((r) => r.route === 'more/import')?.contextKey).toBe('./more/import.tsx')
  const legacy = getStateFromPath('/more/lists', config)!
  expect(legacy.routes[legacy.routes.length - 1].name).toBe('more/[section]')
})
