import React from 'react'
import { render } from '@testing-library/react-native'
import { TariffFeatures } from './TariffFeatures'
import { aiEstimate } from './aiEstimate'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import type { MobileTariff } from './types'
jest.mock('../../shared/hooks/useWorkItemTerminology',()=>({useWorkItemTerminology:()=>({pluralGenitive:'заказов'})}))
jest.mock('@expo/vector-icons',()=>({MaterialCommunityIcons:'Icon'}))
const rates = {transcriptionRubPerSecond:0.1,voiceNoteRub:2,eventDraftRub:4,fileRecordRub:0}
const tariff = {_id:'pro',allowAi:true,aiIncludedRubPerMonth:100,eventsPerMonth:0} as MobileTariff
it('uses supplied rates with shared rounding and honours zero file rate',()=>{
 expect((aiEstimate as Function)(100,rates)).toEqual(['17 мин расшифровки звонков','50 голосовых заметок','25 черновиков по заметке'])
})
it('renders dynamic estimates in the real tariff component',()=>{
 const Component = TariffFeatures as React.ComponentType<any>
 const screen=render(<ThemeProvider forcedMode="dark" storage={null}><Component tariff={tariff} rates={rates}/></ThemeProvider>)
 expect(screen.getByText(/17 мин расшифровки звонков, 50 голосовых заметок или 25 черновиков/)).toBeTruthy()
 expect(screen.queryByText(/записей импорта из файла/)).toBeNull()
})
it('retains measured fallback for an older server',()=>{
 expect(aiEstimate(100)).toContain('500 голосовых заметок')
})
