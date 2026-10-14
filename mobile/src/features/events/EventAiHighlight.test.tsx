import React, { useState } from 'react'
import { TextInput } from 'react-native'
import { fireEvent, render } from '@testing-library/react-native'
import { EventAiHighlight } from './EventAiHighlight'

function EditingField() {
  const [value, setValue] = useState('')
  return <TextInput testID="editing-field" value={value} onChangeText={setValue} />
}
it('снятие AI-подсветки сохраняет смонтированное поле и локальный ввод', () => {
  const screen = render(<EventAiHighlight active field="description"><EditingField /></EventAiHighlight>)
  fireEvent.changeText(screen.getByTestId('editing-field'), 'Продолжаю ввод')
  screen.rerender(<EventAiHighlight active={false} field="description"><EditingField /></EventAiHighlight>)
  expect(screen.getByTestId('editing-field').props.value).toBe('Продолжаю ввод')
  expect(screen.queryByTestId('ai-field-description')).toBeNull()
})
