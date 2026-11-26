import { useCallback, useEffect, useRef, useState } from 'react'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { z } from 'zod'
import { api } from '../../shared/api/client'
import { getAuthSessionEpoch } from '../../shared/auth/tokenStore'
import { localDataEpoch } from '../../shared/storage/localEntityCoordination'
import { Button, ErrorNotice, Field, Notice, PageHeader, Screen, SectionTitle, Surface } from '../../shared/ui/components'
import { VoiceDraftSection, type AiAssistantInputSource } from './VoiceDraftSection'
import { aiReviewError, listAiReviews, openAiReview, type AiReview } from './aiReview'
import { listAiCreateReviews, openAiCreateReview, type AiCreateReview } from './aiCreateReview'
import { consumeSharedDraft, readSharedDraft } from '../../shared/native/shareDraft'
import { deviceSession } from '../../shared/native/device'

const resultSchema = z.object({ candidates: z.array(z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i), title: z.string(), client: z.string(), date: z.string().nullable().optional() })).optional(),
  question: z.string().optional(), needsClipboardPhone: z.boolean().optional() })
type Candidate = NonNullable<z.infer<typeof resultSchema>['candidates']>[number]
export default function AiAssistantScreen() {
  const params = useLocalSearchParams<{ eventId?: string; mode?: string; shareDraft?: string }>()
  const [entry] = useState(params)
  const [sharedDraft] = useState(() => entry.shareDraft ? readSharedDraft(entry.shareDraft, deviceSession()?.generation) : null)
  useEffect(() => { if (sharedDraft) consumeSharedDraft(sharedDraft.id, sharedDraft.generation) }, [sharedDraft])
  const [scope] = useState(() => ({ epoch: localDataEpoch(), auth: getAuthSessionEpoch() }))
  const alive = useRef(true), working = useRef(false)
  const current = useCallback(() => alive.current && scope.epoch === localDataEpoch() && scope.auth === getAuthSessionEpoch(), [scope])
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const [pending, setPending] = useState<AiReview[]>([])
  const [creations, setCreations] = useState<AiCreateReview[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [request, setRequest] = useState<{ text: string; inputSource: AiAssistantInputSource }>({ text: '', inputSource: 'text' })
  const [question, setQuestion] = useState(''), [phone, setPhone] = useState('')
  const [needsPhone, setNeedsPhone] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  useFocusEffect(useCallback(() => {
    let focused = true
    Promise.all([listAiReviews(), entry.eventId ? [] : listAiCreateReviews()]).then(([items, drafts]) => { if (focused && current()) {
      setPending(items.filter(item => !entry.eventId || item.plan.eventId === entry.eventId)); setCreations(drafts)
    } })
      .catch(() => { if (focused && current()) setError('Не удалось прочитать незавершённые изменения') })
    return () => { focused = false }
  }, [current, entry.eventId]))
  const open = (review: AiReview) => router.push({ pathname: '/events/edit/[id]', params: { id: review.plan.eventId, aiPlan: review._id } } as never)
  const openCreate = (review: AiCreateReview) => router.push({ pathname: '/events/edit/[id]', params: { id: 'new', aiDraft: review._id } } as never)
  const analyze = async (text: string, inputSource: AiAssistantInputSource, eventId = entry.eventId) => {
    if (!current() || working.current) return
    const sameRequest = text === request.text && inputSource === request.inputSource
    const clipboardPhone = sameRequest ? phone : ''
    if (!sameRequest) setPhone('')
    setNeedsPhone(false)
    working.current = true; setBusy(true); setError(''); setCandidates([]); setQuestion(''); setRequest({ text, inputSource })
    try {
      // Searching never guesses one of several matching records.
      const result = await api.post<Record<string, unknown>>('/mobile/v1/events/ai-assistant', {
        text,
        ...(eventId ? { eventId } : {}),
        ...(inputSource === 'voice' ? { inputSource } : {}),
        ...(clipboardPhone ? { clipboardPhone } : {}),
      })
      if (!current()) return
      if (result.planId) { const review = await openAiReview(result, current); if (current()) open(review); return }
      if (result.fields) { const review = await openAiCreateReview(result, text, current); if (current()) openCreate(review); return }
      const response = resultSchema.parse(result)
      setCandidates(response.candidates || []); setQuestion(response.question || 'Уточните запрос и повторите разбор.'); setNeedsPhone(Boolean(response.needsClipboardPhone))
    } catch (reason) { if (current()) setError(aiReviewError(reason)) }
    finally { working.current = false; if (current()) setBusy(false) }
  }
  return <Screen keyboardShouldPersistTaps="handled"><PageHeader title={entry.eventId ? 'Изменить с ИИ' : 'Помощник ИИ'} />
    <Notice message="Опишите новую заявку или изменения голосом или текстом. Помощник предложит подходящую запись или заполнит новую форму. Сохранение — только после вашей проверки." />
    {pending.length ? <Surface><SectionTitle>Незавершённые изменения</SectionTitle>{pending.map(item => <Button key={item._id} title={`${item.plan.eventTitle} · ${item.attempt ? 'продолжить сохранение' : 'проверить предложения'}`} variant="secondary" disabled={busy} onPress={() => open(item)} />)}</Surface> : null}
    {creations.length ? <Surface><SectionTitle>Незавершённые заявки</SectionTitle>{creations.map(item => <Button key={item._id} title={`${typeof item.fields.eventType === 'string' ? item.fields.eventType : 'Новая заявка'} · ${item.eventAttempt ? 'продолжить сохранение' : 'проверить форму'}`} variant="secondary" disabled={busy} onPress={() => openCreate(item)} />)}</Surface> : null}
    <VoiceDraftSection initialMode={entry.mode === 'text' || sharedDraft ? 'text' : 'voice'} initialText={sharedDraft?.text} onApply={() => {}} onAnalyzeText={analyze} />
    {needsPhone ? <Surface><Field label="Телефон из буфера обмена" value={phone} onChangeText={setPhone} keyboardType="phone-pad" editable={!busy} /><Button title="Продолжить с этим телефоном" onPress={() => void analyze(request.text, request.inputSource)} loading={busy} disabled={!phone.trim()} /></Surface> : null}
    {question ? <Notice message={question} /> : null}
    {candidates.map(candidate => <Button key={candidate.id} variant="secondary" title={`${candidate.title} · ${candidate.client}${candidate.date ? ` · ${new Date(candidate.date).toLocaleDateString('ru-RU')}` : ''}`} disabled={busy} onPress={() => void analyze(request.text, request.inputSource, candidate.id)} />)}
    {error ? <ErrorNotice message={error} /> : null}
  </Screen>
}
