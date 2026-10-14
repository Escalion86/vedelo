import React from 'react'
import { Alert } from 'react-native'
import { act, fireEvent, render } from '@testing-library/react-native'
let subject: any = {}
try {
  subject = require('./ProposalPackagesEditor')
} catch (error) {
  if (
    !String((error as { message?: string })?.message).includes(
      "Cannot find module './ProposalPackagesEditor'"
    )
  )
    throw error
}
const edited = {
  serviceId: 's',
  title: 'Снимок',
  description: 'Своя правка',
  price: 42,
}
const deleted = {
  serviceId: 'deleted',
  title: 'Удалённая услуга',
  description: 'Сохранить',
  price: 3,
}
const packageItem = {
  id: 'main',
  title: 'Основной',
  description: '',
  lines: [edited, deleted],
  total: 45,
  manualTotal: false,
  recommended: true,
}
function draw(
  packages = [packageItem],
  services = [
    { _id: 's', title: 'Каталог изменён', price: 999 },
    { _id: 'new', title: 'Новое', price: 10 },
  ]
) {
  expect(subject.ProposalPackagesEditor).toBeDefined()
  const Component = subject.ProposalPackagesEditor
  const change = jest.fn()
  return {
    screen: render(
      <Component packages={packages} services={services} onChange={change} />
    ),
    change,
  }
}
it('catalog selection retains edited and deleted snapshots and updates automatic total', () => {
  const { screen, change } = draw()
  fireEvent.press(screen.getByTestId('proposal-catalog-main'))
  fireEvent.press(screen.getByLabelText('Услуга Новое'))
  fireEvent.press(screen.getByText('Применить выбор услуг'))
  expect(change.mock.calls.at(-1)![0][0]).toMatchObject({
    lines: [
      edited,
      deleted,
      { serviceId: 'new', title: 'Новое', description: '', price: 10 },
    ],
    total: 55,
  })
})
it('catalog cancel does not change draft', () => {
  const { screen, change } = draw()
  fireEvent.press(screen.getByTestId('proposal-catalog-main'))
  fireEvent.press(screen.getByLabelText('Услуга Новое'))
  fireEvent.press(screen.getByText('Отмена выбора услуг'))
  expect(change).not.toHaveBeenCalled()
})
it('custom line detached from catalog retains text and only applies on confirmation', () => {
  const { screen, change } = draw()
  fireEvent.press(screen.getByTestId('proposal-edit-main-0'))
  fireEvent.press(screen.getByText('Своя позиция'))
  expect(change).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Применить позицию'))
  expect(change.mock.calls[0][0][0].lines[0]).toEqual({
    ...edited,
    serviceId: '',
  })
})
it('manual total stays fixed when line deleted after confirmation', async () => {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  const { screen, change } = draw([
    { ...packageItem, manualTotal: true, total: 100 },
  ])
  fireEvent.press(screen.getByTestId('proposal-remove-main-0'))
  expect(change).not.toHaveBeenCalled()
  const buttons = spy.mock.calls[0][2]!
  await act(async () =>
    buttons.find((b) => b.style === 'destructive')!.onPress!()
  )
  expect(change.mock.calls[0][0][0]).toMatchObject({
    lines: [deleted],
    total: 100,
  })
  spy.mockRestore()
})
it('6 packages and 30 lines cannot overflow', () => {
  const packages = Array.from({ length: 6 }, (_, i) => ({
    ...packageItem,
    id: `p${i}`,
    lines: Array.from({ length: 30 }, () => edited),
  }))
  const { screen } = draw(packages)
  expect(
    screen.getByTestId('proposal-add-package').props.accessibilityState.disabled
  ).toBe(true)
  expect(
    screen.getByTestId('proposal-custom-p0').props.accessibilityState.disabled
  ).toBe(true)
})
