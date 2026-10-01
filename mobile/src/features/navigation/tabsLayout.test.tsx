import React from 'react'
import { render } from '@testing-library/react-native'
import TabsLayout from '../../../app/(tabs)/_layout'

const mockScreens = jest.fn()
jest.mock('./MobileBottomBar', () => ({ MobileBottomBar: () => null }))
jest.mock('expo-router', () => {
  const ReactModule = require('react') as typeof React
  const Tabs = ({ children, tabBar }: { children: React.ReactNode; tabBar: unknown }) => {
    mockScreens(ReactModule.Children.toArray(children).map((child) => (child as React.ReactElement).props), tabBar)
    return null
  }
  Tabs.Screen = () => null
  return { Tabs }
})

it('сохраняет старые адресуемые routes, скрывает служебные вкладки и использует собственную панель', () => {
  render(<TabsLayout />)
  const [screens, tabBar] = mockScreens.mock.calls[0]
  expect(screens.map((screen: { name: string }) => screen.name)).toEqual(['index', 'events', 'clients', 'finance', 'more', 'tasks', 'profile'])
  for (const name of ['finance', 'more', 'tasks', 'profile']) {
    expect(screens.find((screen: { name: string }) => screen.name === name).options.href).toBeNull()
  }
  expect(typeof tabBar).toBe('function')
  expect(screens.some((screen: { name: string }) => screen.name === 'create')).toBe(false)
})
