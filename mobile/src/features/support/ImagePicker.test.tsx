import React from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'
import { SupportImagePicker } from './ImagePicker'
import * as Picker from 'expo-document-picker'
import { copyImage } from '../profile/nativeImage'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
const mockDispose=jest.fn()
jest.mock('expo-document-picker',()=>({getDocumentAsync:jest.fn()}))
jest.mock('../profile/nativeImage',()=>({copyImage:jest.fn()}))
jest.mock('@expo/vector-icons',()=>({MaterialCommunityIcons:()=>null}))
jest.mock('expo-router',()=>({useFocusEffect:(callback:()=>void)=>require('react').useEffect(callback,[callback])}))
const asset={uri:'content://source',name:'photo.jpg',mimeType:'image/jpeg',size:100}
beforeEach(()=>{jest.resetAllMocks();(copyImage as jest.Mock).mockReturnValue({uri:'file:///owned',dispose:mockDispose})})
it.each(['light','dark'] as const)('%s: picker сохраняет собственную копию и очищает после removal/unmount',async(mode)=>{
 ;(Picker.getDocumentAsync as jest.Mock).mockResolvedValue({canceled:false,assets:[asset]})
 const change=jest.fn(),error=jest.fn(),screen=render(<ThemeProvider forcedMode={mode} storage={null}><SupportImagePicker images={[]} onChange={change} onError={error}/></ThemeProvider>)
 fireEvent.press(screen.getByText('Прикрепить изображения'));await act(async()=>undefined)
 expect(change).toHaveBeenCalledWith([{...asset,uri:'file:///owned'}]);expect(mockDispose).not.toHaveBeenCalled()
 screen.rerender(<ThemeProvider forcedMode={mode} storage={null}><SupportImagePicker images={[{...asset,uri:'file:///owned'}]} onChange={change} onError={error}/></ThemeProvider>)
 fireEvent.press(screen.getByLabelText('Удалить photo.jpg'));expect(change).toHaveBeenLastCalledWith([])
 screen.rerender(<ThemeProvider forcedMode={mode} storage={null}><SupportImagePicker images={[]} onChange={change} onError={error}/></ThemeProvider>)
 expect(mockDispose).toHaveBeenCalledTimes(1);screen.unmount();expect(mockDispose).toHaveBeenCalledTimes(1)
})
it.each([{...asset,size:11*1024*1024},{...asset,mimeType:'image/gif'}, {...asset,size:0}])('не копирует invalid image %j',async(invalid)=>{
 ;(Picker.getDocumentAsync as jest.Mock).mockResolvedValue({canceled:false,assets:[invalid]})
 const change=jest.fn(),error=jest.fn(),screen=render(<SupportImagePicker images={[]} onChange={change} onError={error}/>);fireEvent.press(screen.getByText('Прикрепить изображения'));await act(async()=>undefined)
 expect(error).toHaveBeenCalled();expect(change).not.toHaveBeenCalled();expect(copyImage).not.toHaveBeenCalled()
})
it('поздний picker после ухода не меняет экран и не удаляет исходник',async()=>{
 let finish:(value:unknown)=>void=()=>undefined;(Picker.getDocumentAsync as jest.Mock).mockImplementation(()=>new Promise(resolve=>finish=resolve))
 const change=jest.fn(),screen=render(<SupportImagePicker images={[]} onChange={change} onError={jest.fn()}/>);fireEvent.press(screen.getByText('Прикрепить изображения'));screen.unmount()
 await act(async()=>finish({canceled:false,assets:[asset]}));expect(change).not.toHaveBeenCalled();expect(copyImage).not.toHaveBeenCalled()
})
