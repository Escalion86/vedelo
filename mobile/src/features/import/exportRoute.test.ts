import fs from 'node:fs'
import path from 'node:path'
import { getRoutes } from 'expo-router/build/getRoutes'
import { getReactNavigationConfig } from 'expo-router/build/getReactNavigationConfig'
import { getStateFromPath } from 'expo-router/build/fork/getStateFromPath'
import type { RequireContext } from 'expo-router/build/types'
it('static export/import выигрывают у legacy [section] в установленном matcher', () => {
  const app = path.resolve(__dirname, '../../../app')
  const keys = ['./_layout.tsx', ...fs.readdirSync(path.join(app, 'more')).filter(n => n.endsWith('.tsx')).map(n => `./more/${n}`)]
  const context = Object.assign(() => ({ default: () => null }), { keys: () => keys, resolve: (key: string) => key, id: 'export-route' }) as RequireContext
  const tree = getRoutes(context, { platform: 'android', ignoreEntryPoints: true, sitemap: false, notFound: false })!, config = getReactNavigationConfig(tree, true)
  for (const name of ['export', 'import']) expect(getStateFromPath(`/more/${name}`, config)!.routes.at(-1)?.name).toBe(`more/${name}`)
  expect(getStateFromPath('/more/lists', config)!.routes.at(-1)?.name).toBe('more/[section]')
})
