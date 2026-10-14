import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { FieldHelp } from './FieldHelp'
import { ThemeProvider } from './ThemeProvider'
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View}))
it.each(['light','dark'] as const)('подсказка %s: читаемая i без зависимости от отсутствующего глифа, цель 44 dp и настоящий текст',mode=>{
 const screen=render(<ThemeProvider forcedMode={mode} storage={null}><FieldHelp label="Возможность тарифа" text="Условия выбранного тарифа"/></ThemeProvider>)
 expect(screen.getByTestId('field-help-icon',{includeHiddenElements:true})).toHaveStyle({width:22,height:22,borderRadius:11})
 expect(screen.getByText('i',{includeHiddenElements:true})).toHaveStyle({fontFamily:'InterTight',fontSize:14})
 const button=screen.getByLabelText('Подсказка: Возможность тарифа');expect(button).toHaveStyle({minWidth:44,minHeight:44});fireEvent.press(button)
 expect(screen.getByText('Условия выбранного тарифа')).toBeTruthy()
})
