import { StyleSheet, Text, View } from 'react-native'
import { HelpLabel } from '../../shared/ui/FieldHelp'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import { typography, type Palette } from '../../shared/ui/theme'
import { useWorkItemTerminology } from '../../shared/hooks/useWorkItemTerminology'
import { formatRubles } from './format'
import type { AiIncludedRates, MobileTariff } from './types'
import { aiEstimate } from './aiEstimate'
// Тексты helpers/tariffFeatureHelp.js, проверяются браузерной парой.
const helps: Record<string, string> = {
  eventsLimit:
    'Сколько новых заявок и заказов можно создать за календарный месяц на этом тарифе. Уже созданные заявки не пропадают: их можно вести и редактировать дальше.',
  allowCalendarSync:
    'Заказы и напоминания синхронизируются с Google Календарём: сроки и встречи видны в привычном календаре.',
  allowStatistics:
    'Сводка по заказам и деньгам: суммы, маржа, статусы, фильтры по году и городу, выгрузка в CSV.',
  allowDocuments:
    'Документы в .docx из ваших шаблонов: договоры, акты и другие бланки. Данные подставляются из карточки заказа, клиента и реквизитов.',
  allowClientReviews:
    'Приватная обратная связь по выполненной работе: клиент ставит оценку от 1 до 5 и при желании оставляет комментарий. Отзыв видите только вы.',
  allowProposals:
    'Персональное коммерческое предложение из заявки: собираете состав работ и цены, отправляете клиенту секретной ссылкой. Отправленная версия сохраняется как снимок.',
  allowTelephony:
    'Звонки через вашу IP-телефонию: история и записи привязаны к заказу и клиенту, запись можно послушать из карточки. При включённых ИИ-возможностях запись можно расшифровать в текст.',
  allowAi:
    'ИИ-помощник: расшифровка звонков и голосовых заметок, черновик заявки из голосовой заметки, импорт заказов из файла или Google Календаря.',
  allowAvitoIntegration:
    'Новые сообщения из Avito Messenger попадают в Ведело и сами создают заявку, диалог привязан к клиенту. Подключается в разделе «Настройки → Интеграции → Avito» и работает персонально для вашего аккаунта.',
  allowVkIntegration:
    'Сообщения сообщества VK приходят в Ведело: диалог связан с клиентом, отвечать можно из кабинета, не переключаясь на VK.',
  allowTelegramIntegration:
    'Переписка Telegram Business: сообщения вашего Telegram-аккаунта приходят в Ведело, диалог связан с клиентом, отвечать можно из кабинета.',
  allowPublicLeadApi:
    'Публичный API входящих заявок: форма на вашем сайте или Tilda отправляет заявку напрямую в Ведело — она появляется в списке сразу, без ручного переноса.',
}
const rows = [
 ['eventsLimit','Лимит работ'],['allowCalendarSync','Google Календарь'],['allowStatistics','Статистика'],['allowDocuments','Документы'],['allowClientReviews','Отзывы клиентов'],['allowProposals','Коммерческие предложения'],['allowTelephony','Телефония'],['allowAi','ИИ-возможности'],['allowAvitoIntegration','Avito'],['allowVkIntegration','VK'],['allowTelegramIntegration','Telegram Business'],['allowPublicLeadApi','Публичный API'],
] as const
export function tariffAiHelp(tariff: MobileTariff) {
  const base = helps.allowAi
  if (!tariff.allowAi) return `${base} В этом тарифе ИИ-возможности не подключены.`
  const amount = includedAmount(tariff)
  return amount > 0 ? `${base} В этом тарифе на ИИ включено ${formatRubles(amount)} в месяц: эта сумма тратится в первую очередь, дальше расходы идут с баланса.` : `${base} В этом тарифе ИИ не включён: запросы оплачиваются с баланса.`
}
export const includedAmount = (tariff: MobileTariff) => tariff.allowAi && Number.isFinite(tariff.aiIncludedRubPerMonth) ? Math.max(tariff.aiIncludedRubPerMonth || 0, 0) : 0
export function TariffFeatures({ tariff, rates, context = 'choice' }: { tariff: MobileTariff; rates?: AiIncludedRates; context?: 'choice' | 'current' }) {
 const marker=context === 'current' ? 'current-' : ''
 const styles=useThemeStyles(createStyles), terms=useWorkItemTerminology(), included=includedAmount(tariff)
 const estimate=aiEstimate(included, rates)
 return <View testID={`${marker}tariff-features-${tariff._id}`} style={styles.list}>
  {rows.map(([key,base])=>{
   const allowed=key==='eventsLimit' || (key==='allowProposals' ? tariff.allowProposals ?? tariff.allowDocuments : tariff[key] === true)
   const label=key==='eventsLimit'?`Лимит ${terms.pluralGenitive || 'работ'}`:key==='allowAi' && included ? `${base} (${formatRubles(included)} включено)` : base
   const value=key==='eventsLimit' ? tariff.eventsPerMonth > 0 ? `${tariff.eventsPerMonth}/мес` : 'Без лимита' : allowed ? 'Доступно' : 'Не подключено'
   return <View key={key} testID={`${marker}tariff-feature-${tariff._id}-${key}`} style={styles.row}><View style={styles.grow}><HelpLabel label={label} help={key==='allowAi'?tariffAiHelp(tariff):helps[key]} style={styles.text}/></View><Text style={styles.value}>{value}</Text></View>
  })}
  {included>0 && estimate.length>0?<View testID={`${marker}ai-estimate-${tariff._id}`} style={styles.estimate}><Text style={styles.meta}>ИИ в тарифе на {formatRubles(included)} — это примерно {estimate.length > 1 ? `${estimate.slice(0, -1).join(', ')} или ${estimate[estimate.length - 1]}` : estimate[0]}</Text><Text style={styles.meta}>Примеры разных сценариев использования, а не суммарный пакет. Оценка по средним расходам ИИ. Фактический расход зависит от длины записи и объёма текста. Лимит учитывается в рублях за календарный месяц.</Text></View>:null}
 </View>
}
const createStyles=(p:Palette)=>StyleSheet.create({list:{gap:4},row:{flexDirection:'row',alignItems:'center',gap:8,minHeight:44},grow:{flex:1,minWidth:0},text:{fontFamily:typography.fontFamily,color:p.text,fontSize:13},value:{fontFamily:typography.fontFamily,color:p.cardMuted,fontSize:12,maxWidth:90},meta:{fontFamily:typography.fontFamily,color:p.cardMuted,fontSize:12,lineHeight:18},estimate:{gap:8,marginTop:8}})
