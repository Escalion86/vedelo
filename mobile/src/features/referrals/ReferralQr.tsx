import { useEffect, useState } from 'react'
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native'
import { Button, Notice } from '../../shared/ui/components'
import { useTheme } from '../../shared/ui/ThemeProvider'
const service = 'https://qr.escalion.ru/api/v1/qr/generate'
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const base64=(bytes:Uint8Array)=>{let text='';for(let i=0;i<bytes.length;i+=3){const a=bytes[i],b=bytes[i+1],c=bytes[i+2];text+=alphabet[a>>2]+alphabet[((a&3)<<4)|((b||0)>>4)]+(i+1<bytes.length?alphabet[((b&15)<<2)|((c||0)>>6)]:'=')+(i+2<bytes.length?alphabet[c&63]:'=')}return text}
export async function loadReferralQr(link:string,signal:AbortSignal):Promise<string> {
 const url=new URL(link)
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/register'||!url.searchParams.get('ref'))throw Error('Некорректная ссылка')
 const response=await fetch(service,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'url',data:{url:link},options:{width:300,margin:2,errorCorrectionLevel:'H'}}),signal})
 if(!response.ok||!response.headers.get('content-type')?.toLowerCase().startsWith('image/png'))throw Error('QR недоступен')
 const bytes=new Uint8Array(await response.arrayBuffer())
 if(bytes.length>1024*1024||bytes.length<8||[137,80,78,71,13,10,26,10].some((v,i)=>bytes[i]!==v))throw Error('Некорректный QR')
 return `data:image/png;base64,${base64(bytes)}`
}
export function ReferralQr({link}:{link:string}) {
 const {palette}=useTheme();const [attempt,retry]=useState(0),[result,set]=useState({link:'',uri:'',error:'',loading:true})
 useEffect(()=>{const controller=new AbortController();set({link,uri:'',error:'',loading:true});loadReferralQr(link,controller.signal).then(uri=>{if(!controller.signal.aborted)set({link,uri,error:'',loading:false})}).catch(()=>{if(!controller.signal.aborted)set({link,uri:'',error:'Не удалось загрузить QR-код. Ссылка и её отправка остаются доступны.',loading:false})});return()=>controller.abort()},[link,attempt])
 const current=result.link===link?result:null
 return <View testID="referral-qr" style={styles.container}>{current?.uri?<Image testID="referral-qr-image" accessibilityLabel="QR-код реферальной ссылки" source={{uri:current.uri}} onError={()=>set({link,uri:'',error:'Не удалось показать QR-код. Повторите загрузку.',loading:false})} style={styles.image}/>:current?.error?<><Notice tone="warning" message={current.error}/><Button title="Повторить загрузку QR-кода" variant="secondary" onPress={()=>retry(n=>n+1)}/></>:<ActivityIndicator color={palette.primary} accessibilityLabel="Загрузка QR-кода"/>}</View>
}
const styles=StyleSheet.create({container:{alignItems:'center',gap:8},image:{width:240,height:240,maxWidth:'100%',backgroundColor:'#ffffff'}})
