import { useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { Field, SectionTitle } from '../../shared/ui/components'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { typography } from '../../shared/ui/theme'
import type { ReviewAppearance } from './types'
// Цвета публичного preview совпадают с ReviewPageView.module.css и изолированы от кабинета.
const accentColors = { light:{sand:'#a86f2a',terracotta:'#a8512c',emerald:'#1d6f4d',sky:'#235d9c',violet:'#6243a8'}, dark:{sand:'#e2b878',terracotta:'#ef9c7b',emerald:'#7cd0a6',sky:'#91c2ee',violet:'#c4aff0'} }
export function ReviewPagePreview({ appearance, origin, dark=false }: {appearance:ReviewAppearance;origin:string;dark?:boolean}) {
  const [rating,setRating] = useState(0),[comment,setComment] = useState('')
  const saved = Boolean(appearance.publicName.trim()), scheme = dark?'dark':'light', accent = accentColors[scheme][appearance.accent]
  const text = dark?'#f5f1ea':'#211d19', muted=dark?'#b3aaa0':'#6b645c'
  const cover = !saved?'plain':appearance.cover
  const bg = cover==='deep'?'#191510':cover==='warm'?'#f4e4cb':dark?'#131110':'#f6f4f0'
  const fg = cover==='deep'?'#f8f3ea':cover==='warm'?'#211d19':text
  const name = saved?appearance.publicName.trim():'Отзыв о работе — Ведело'
  const description = saved && appearance.greeting.trim() || `${saved && appearance.specialization.trim()?`${appearance.specialization.trim()} · `:''}Оцените работу — это займёт не больше минуты.`
  return <View style={styles.wrap}>
    <SectionTitle>Предпросмотр формы</SectionTitle>
    <View testID="review-page-preview" style={[styles.preview,{backgroundColor:dark?'#131110':'#f6f4f0'}]}>
      <View testID="review-preview-cover" style={[styles.cover,{backgroundColor:bg}]}>
        {saved && appearance.logoUrl ? <Image source={{uri:appearance.logoUrl}} resizeMode="contain" style={styles.logo} accessibilityLabel="Фото исполнителя в предпросмотре" />:null}
        <Text style={[styles.heading,{color:fg}]}>{name}</Text>
        {saved && appearance.specialization ? <Text style={[styles.text,{color:fg}]}>{appearance.specialization}</Text>:null}
        <Text style={[styles.text,{color:fg}]}>{saved && appearance.greeting || 'Оцените работу исполнителя — это займёт не больше минуты.'}</Text>
      </View>
      <View style={styles.body}>
        <Text style={[styles.text,{color:muted}]}>Пример формы · ничего не отправляется</Text>
        <View style={styles.stars}>{[1,2,3,4,5].map((value)=><Pressable key={value} testID={`review-preview-rating-${value}`} accessibilityRole="button" accessibilityLabel={`Пример оценки: ${value} из 5`} accessibilityState={{selected:rating===value}} onPress={()=>setRating(value)} style={styles.star}><Text style={[styles.starText,{color:value<=rating?accent:muted}]}>★</Text></Pressable>)}</View>
        <ThemeProvider forcedMode={scheme} storage={null}><Field label="Пример комментария" value={comment} onChangeText={setComment} multiline maxLength={2000} /></ThemeProvider>
        <View style={[styles.sampleButton,{backgroundColor:accent}]}><Text style={[styles.text,{color:dark?'#241c10':'#ffffff',textAlign:'center'}]}>Отправить отзыв · пример</Text></View>
        <Text style={[styles.text,{color:muted}]}>Отзыв увидит только исполнитель</Text>
      </View>
    </View>
    <SectionTitle>Предпросмотр карточки ссылки</SectionTitle>
    <View testID="review-link-preview" style={[styles.body,{backgroundColor:dark?'#1e1b18':'#ffffff'}]}>
      <Text style={[styles.text,{color:muted}]}>{origin.replace(/^https?:\/\//,'')}</Text>
      {saved && appearance.logoUrl?<Image source={{uri:appearance.logoUrl}} resizeMode="contain" style={styles.logo} />:null}
      <Text style={[styles.heading,{color:text}]}>{saved?`Отзыв о работе · ${name}`:name}</Text>
      <Text style={[styles.text,{color:muted}]}>{description}</Text>
    </View>
  </View>
}
const styles=StyleSheet.create({wrap:{gap:12},preview:{overflow:'hidden',borderRadius:8},cover:{width:'100%',padding:16,gap:8},body:{padding:16,gap:10},heading:{fontFamily:typography.fontFamily,fontSize:20,fontWeight:'600',flexShrink:1},text:{fontFamily:typography.fontFamily,fontSize:14,lineHeight:20,flexShrink:1},logo:{width:72,height:72,borderRadius:16},stars:{flexDirection:'row',justifyContent:'space-between',flexWrap:'wrap'},star:{minWidth:44,minHeight:48,alignItems:'center',justifyContent:'center'},starText:{fontSize:28},sampleButton:{padding:12,borderRadius:8}})
