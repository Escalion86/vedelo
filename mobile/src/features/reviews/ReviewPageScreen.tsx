import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Image, Platform, Text, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { useNavigation, usePreventRemove } from '@react-navigation/native'
import { useAuth } from '../../shared/auth/AuthProvider'
import { Button, Field, Notice, PageHeader, Screen, SectionTitle, Surface } from '../../shared/ui/components'
import { copyImage } from '../profile/nativeImage'
import { accents, covers, emptyAppearance, validateLogo } from './domain'
import { getReviewPage, saveReviewPage, uploadReviewLogo } from './api'
import { ReviewPagePreview } from './ReviewPagePreview'
import { useReviewStyles } from './styles'
import type { ReviewAppearance, ReviewPageData } from './types'
export function ReviewPageScreen() {
  const {user}=useAuth()
  return <ReviewPageForm key={`${user?._id}:${user?.tenantId}`} />
}
function ReviewPageForm() {
  const styles=useReviewStyles(),{user}=useAuth(),navigation=useNavigation()
  const [form,setForm]=useState<ReviewAppearance>({...emptyAppearance}),[saved,setSaved]=useState<ReviewAppearance>({...emptyAppearance})
  const [meta,setMeta]=useState<ReviewPageData|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[dark,setDark]=useState(false)
  const life=useRef(0),lock=useRef(false),controller=useRef<AbortController|null>(null)
  const dirty=JSON.stringify(form)!==JSON.stringify(saved)
  usePreventRemove(dirty,({data})=>Alert.alert('Не сохранено','Оформление изменено. Выйти без сохранения?',[{text:'Продолжить редактирование',style:'cancel'},{text:'Выйти',style:'destructive',onPress:()=>navigation.dispatch(data.action)}]))
  const load=async()=>{
    controller.current?.abort();const abort=new AbortController();controller.current=abort
    const epoch=++life.current;setLoading(true);setError('')
    try{const result=await getReviewPage(abort.signal);if(life.current===epoch){setForm(result.reviewPage);setSaved(result.reviewPage);setMeta(result)}}
    catch{if(life.current===epoch)setError('Не удалось загрузить оформление')}
    finally{if(life.current===epoch)setLoading(false)}
  }
  useEffect(()=>{void load();return()=>{++life.current;controller.current?.abort()}},[user?._id,user?.tenantId])
  const canEdit=Boolean(meta?.allowClientReviews), update=(patch:Partial<ReviewAppearance>)=>{setForm(current=>({...current,...patch}));setNotice('')}
  const save=async()=>{
    if(lock.current || !canEdit || !dirty)return
    lock.current=true;setBusy(true);setError('');setNotice('');const epoch=life.current
    try{const result=await saveReviewPage(form);if(life.current===epoch){setForm(result.reviewPage);setSaved(result.reviewPage);setMeta(result);setNotice('Оформление сохранено')}}
    catch{if(life.current===epoch)setError('Не удалось сохранить оформление. Повторите попытку')}
    finally{lock.current=false;if(life.current===epoch)setBusy(false)}
  }
  const upload=async()=>{
    if(lock.current || !canEdit)return
    lock.current=true;setBusy(true);setError('');setNotice('');const epoch=life.current
    let copy:ReturnType<typeof copyImage>|undefined
    try{
      const result=await DocumentPicker.getDocumentAsync({type:['image/png','image/jpeg','image/webp'],multiple:false,copyToCacheDirectory:false})
      if(result.canceled || life.current!==epoch)return
      const asset=result.assets[0],selected={uri:asset.uri,name:asset.name,mimeType:asset.mimeType || '',size:asset.size || 0}
      const invalid=validateLogo(selected);if(invalid){setError(invalid);return}
      let blob:Blob|undefined
      if(Platform.OS==='web')blob=asset.file || await (await fetch(asset.uri)).blob()
      else{copy=copyImage(asset.uri,asset.name);selected.uri=copy.uri}
      const url=await uploadReviewLogo(selected,blob)
      if(life.current===epoch){update({logoUrl:url});setNotice('Изображение загружено. Сохраните оформление')}
    }catch{if(life.current===epoch)setError('Не удалось загрузить изображение. Повторите попытку')}
    finally{copy?.dispose();lock.current=false;if(life.current===epoch)setBusy(false)}
  }
  return <Screen keyboardShouldPersistTaps="handled"><PageHeader title="Страница отзывов" />
    {loading?<><ActivityIndicator /><Text style={styles.meta}>Загружаем оформление…</Text></>:!meta?<><Notice tone="danger" message={error || 'Не удалось загрузить оформление'} /><Button title="Повторить загрузку" onPress={load} /></>:<View testID="review-page-settings" style={styles.content}>
      {!canEdit?<Notice message="Оформление доступно на тарифе с отзывами клиентов. Уже отправленные ссылки сохраняют оформление." />:null}
      <Notice message="Эти шесть полей станут публичными. Пока публичное имя пустое, страница нейтральная. Данные клиента и приватные заметки не публикуются." />
      <Surface>
        <Field label="Публичное имя" value={form.publicName} onChangeText={publicName=>update({publicName})} editable={canEdit && !busy} maxLength={80} help="Имя или название, которое увидит клиент. Пустое поле отключает персонализацию." />
        <Field help="Короткая подпись под именем. Видна клиенту на странице отзыва." label="Специализация" value={form.specialization} onChangeText={specialization=>update({specialization})} editable={canEdit && !busy} maxLength={120} />
        <Field help="Необязательная фраза над формой. Попадает в карточку ссылки в мессенджере." label="Обращение к клиенту" value={form.greeting} onChangeText={greeting=>update({greeting})} editable={canEdit && !busy} multiline maxLength={300} />
        <SectionTitle help="PNG, JPG или WebP до 5 МБ. Показывается в шапке и карточке ссылки. Не заменяет публичное имя.">Фото или логотип</SectionTitle>
        {form.logoUrl?<Image testID="review-logo" source={{uri:form.logoUrl}} resizeMode="contain" style={styles.image} accessibilityLabel="Фото или логотип" />:null}
        <Button testID="review-logo-upload" title="Выбрать фото или логотип" variant="secondary" disabled={!canEdit} loading={busy} onPress={upload} />
        {form.logoUrl?<Button title="Убрать фото из оформления" variant="secondary" disabled={!canEdit || busy} onPress={()=>update({logoUrl:''})} />:null}
        <Text style={styles.meta}>PNG, JPG или WebP · до 5 МБ. Загрузка добавляет фото в черновик; затем сохраните оформление.</Text>
        <SectionTitle help="Цвет звёзд и кнопки на странице отзыва. Показан в предпросмотре.">Акцентный цвет</SectionTitle>
        <View style={styles.choices}>{accents.map(item=><Button key={item.value} title={item.label} variant={form.accent===item.value?'primary':'secondary'} accessibilityState={{selected:form.accent===item.value}} disabled={!canEdit || busy} onPress={()=>update({accent:item.value})} />)}</View>
        <SectionTitle help="Готовый шаблон шапки страницы. Свой дизайн загрузить нельзя.">Обложка</SectionTitle>
        <View style={styles.choices}>{covers.map(item=><Button key={item.value} title={item.label} variant={form.cover===item.value?'primary':'secondary'} accessibilityState={{selected:form.cover===item.value}} disabled={!canEdit || busy} onPress={()=>update({cover:item.value})} />)}</View>
        <Button testID="review-page-save" title="Сохранить оформление" loading={busy} disabled={!canEdit || !dirty} onPress={save} />
      </Surface>
      {error?<Notice tone="danger" message={error} />:null}{notice?<Notice tone="success" message={notice} />:null}
      <Button title={dark?'Светлый предпросмотр':'Тёмный предпросмотр'} variant="secondary" onPress={()=>setDark(!dark)} />
      <ReviewPagePreview appearance={form} origin={meta.origin} dark={dark} />
    </View>}
  </Screen>
}
