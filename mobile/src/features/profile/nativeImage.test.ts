import { copyImage } from './nativeImage'
const mockDelete=jest.fn(),mockCopy=jest.fn()
jest.mock('expo-file-system',()=>({Paths:{cache:{uri:'file:///cache'}},File:jest.fn().mockImplementation((root:unknown,name?:string)=>({uri:name?'file:///cache/'+name:String(root),exists:true,delete:()=>mockDelete(root,name),copy:mockCopy}))}))
beforeEach(()=>{mockDelete.mockReset();mockCopy.mockReset()})
it('удаляет только собственную копию, исходный content URI не удаляется',()=>{
 const copy=copyImage('content://gallery/photo','photo.jpg');copy.dispose()
 expect(mockCopy).toHaveBeenCalled();expect(mockDelete).toHaveBeenCalledWith({uri:'file:///cache'},expect.stringContaining('vedelo-image-'))
})
it('partial copy очищается при исключении без удаления исходника',()=>{
 mockCopy.mockImplementation(()=>{throw new Error('copy failed')});expect(()=>copyImage('content://gallery/photo','photo.jpg')).toThrow()
 expect(mockDelete).toHaveBeenCalledTimes(1);expect(mockDelete.mock.calls[0][0]).toEqual({uri:'file:///cache'})
})
