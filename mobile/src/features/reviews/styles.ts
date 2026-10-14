import { StyleSheet } from 'react-native'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import { typography, type Palette } from '../../shared/ui/theme'
export const useReviewStyles = () => useThemeStyles((p:Palette)=>StyleSheet.create({
  content:{gap:12},text:{fontFamily:typography.fontFamily,color:p.text,fontSize:16,lineHeight:23,flexShrink:1},meta:{fontFamily:typography.fontFamily,color:p.cardMuted,fontSize:13,lineHeight:19,flexShrink:1},
  actions:{gap:8,flexDirection:'row',flexWrap:'wrap'},heading:{fontFamily:typography.fontFamily,color:p.text,fontSize:18,fontWeight:'600'},
  image:{width:96,height:96,borderRadius:8,alignSelf:'center'},choices:{gap:6},
}))
