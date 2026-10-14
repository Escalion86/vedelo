import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Share } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import {
  Button,
  EmptyState,
  Notice,
  SectionTitle,
  StatusChip,
  Surface,
} from '../../shared/ui/components'
import { useProposalIdentity } from './identity'
import { proposalOperations } from './operations'
import { getFieldHelp } from '../../shared/domain/fieldHelp'
import {
  proposalsApi,
  type Proposal,
  type ProposalTemplate,
  type AppliedEvent,
} from './api'

export type EventProposalsSectionProps = {
  eventId: string
  eventStatus?: 'draft' | 'active' | 'closed' | 'canceled'
  onApplied?: (event: AppliedEvent) => void | Promise<void>
  onChanged?: () => void
}
export const EventProposalsSection = (props: EventProposalsSectionProps) => {
  const identity = useProposalIdentity()
  return identity ? (
    <IdentitySection
      key={`${identity}:${props.eventId}`}
      {...props}
      identity={identity}
    />
  ) : null
}
const IdentitySection = ({
  identity,
  eventId,
  eventStatus,
  onApplied,
  onChanged,
}: EventProposalsSectionProps & { identity: string }) => {
  const [items, setItems] = useState<Proposal[]>([])
  const [templates, setTemplates] = useState<ProposalTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [serverStatus, setServerStatus] = useState<AppliedEvent['status']>()
  const [eventError, setEventError] = useState(false)
  const readRevision = useRef(0)
  const [templateError, setTemplateError] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [creation, setCreation] = useState(() =>
    proposalOperations.get(identity, 'create-proposal', eventId)
  )
  const [, redraw] = useState(0)
  const lifetime = useRef(new AbortController())
  const generation = useRef(0)
  const alive = useRef(false)
  const locked = useRef(false)
  const operation = useCallback(
    () => ({
      expectedIdentity: identity,
      signal: lifetime.current.signal,
    }),
    [identity]
  )
  useEffect(
    () =>
      proposalOperations.subscribe(() => {
        if (alive.current) {
          setCreation(
            proposalOperations.get(identity, 'create-proposal', eventId)
          )
          redraw((n) => n + 1)
        }
      }),
    [identity, eventId]
  )
  const load = useCallback(async () => {
    if (eventId.startsWith('local-')) {
      setLoading(false)
      return
    }
    const token = generation.current
    const revision = ++readRevision.current
    setLoading(true)
    setError('')
    const [list, choices, event] = await Promise.allSettled([
      proposalsApi.list(eventId, operation()),
      proposalsApi.templates(operation()),
      proposalsApi.readEvent(eventId, operation()),
    ])
    if (
      !alive.current ||
      token !== generation.current ||
      revision !== readRevision.current
    )
      return
    setEventError(event.status === 'rejected')
    setServerStatus(
      event.status === 'fulfilled' ? event.value.status : undefined
    )
    if (list.status === 'fulfilled') setItems(list.value)
    else setError('Не удалось загрузить предложения.')
    setTemplateError(choices.status === 'rejected')
    if (choices.status === 'fulfilled')
      setTemplates(choices.value.filter((item) => item.status === 'active'))
    setLoading(false)
  }, [eventId, operation])
  useFocusEffect(
    useCallback(() => {
      generation.current++
      alive.current = true
      lifetime.current = new AbortController()
      setBusy(locked.current)
      setCreation(proposalOperations.get(identity, 'create-proposal', eventId))
      setItems([])
      setChoosing(false)
      void load()
      return () => {
        alive.current = false
        lifetime.current.abort()
        generation.current++
      }
    }, [load, identity, eventId])
  )
  const run = async (work: () => Promise<void>) => {
    if (!alive.current || locked.current) return
    const token = generation.current
    readRevision.current++
    setLoading(false)
    locked.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await work()
    } catch {
      if (alive.current && token === generation.current)
        setError(
          'Действие не подтверждено. Проверьте сеть и повторите чтение КП.'
        )
    } finally {
      locked.current = false
      if (alive.current) setBusy(false)
    }
  }
  const openCreated = (item: Proposal) => {
    if (item.eventId !== eventId) throw new Error('EVENT_MISMATCH')
    onChanged?.()
    router.push(
      `/events/${encodeURIComponent(eventId)}/proposals/${encodeURIComponent(item._id)}` as never
    )
  }
  const create = (body: { templateId?: string; sourceProposalId?: string }) => {
    if (
      proposalOperations.get(identity, 'create-proposal', eventId) ||
      locked.current ||
      !alive.current
    )
      return
    return run(async () => {
      const token = generation.current
      const item = await proposalsApi.create(eventId, body, operation())
      if (!alive.current || token !== generation.current) return
      openCreated(item)
    })
  }
  const recoverCreation = () =>
    run(async () => {
      const token = generation.current
      const item = await proposalsApi.recoverCreate(eventId, operation())
      if (alive.current && token === generation.current) openCreated(item)
    })
  const deliverApplied = async (item: Proposal, fresh: AppliedEvent) => {
    setServerStatus(fresh.status)
    await onApplied?.(fresh)
    proposalOperations.clear(identity, 'apply', item._id)
  }
  const recoverApply = (item: Proposal) =>
    run(async () => {
      const token = generation.current
      const result = await proposalsApi.recoverApply(
        item._id,
        eventId,
        operation()
      )
      if (!alive.current || token !== generation.current) return
      await deliverApplied(result.proposal, result.event)
      if (alive.current && token === generation.current) onChanged?.()
    })
  const action = (item: Proposal, name: 'publish' | 'revoke' | 'apply') => {
    if (name === 'revoke' && item.selectedPackageId) return
    const perform = () =>
      void run(async () => {
        const token = generation.current
        const result = await proposalsApi.action(item, name, operation())
        if (!alive.current || token !== generation.current) return
        if (result.event) await deliverApplied(result.proposal, result.event)
        if (!alive.current || token !== generation.current) return
        setItems((values) =>
          values.map((value) =>
            value._id === result.proposal._id ? result.proposal : value
          )
        )
        const list = await proposalsApi.list(eventId, operation())
        if (!alive.current || token !== generation.current) return
        setItems(list)
        if (!alive.current || token !== generation.current) return
        onChanged?.()
        setMessage(
          name === 'publish'
            ? 'Предложение опубликовано'
            : name === 'revoke'
              ? 'Ссылка отозвана'
              : 'Выбранный вариант применён'
        )
      })
    if (name === 'apply' || name === 'revoke')
      Alert.alert(
        name === 'apply' ? 'Применить выбранный вариант?' : 'Отозвать доступ?',
        name === 'apply'
          ? 'Услуги и сумма будут заменены выбранным вариантом. Полный состав сохранится для документов; договор и счёт автоматически не создаются.'
          : 'Клиентская ссылка перестанет работать.',
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: name === 'apply' ? 'Применить' : 'Отозвать',
            style: name === 'revoke' ? 'destructive' : 'default',
            onPress: perform,
          },
        ]
      )
    else perform()
  }
  const remove = (item: Proposal) =>
    Alert.alert(
      'Удалить предложение?',
      `«${item.title}», версия ${item.version}.${item.selectedPackageId ? ' Клиент уже выбрал вариант.' : ''} Ссылка перестанет работать. Ранее применённые услуги и сумма сохранятся.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () =>
            void run(async () => {
              const token = generation.current
              const result = await proposalsApi.remove(item, operation())
              if (!alive.current || token !== generation.current) return
              setItems(result.items)
              setServerStatus(result.event.status)
              await onApplied?.(result.event)
              if (!alive.current || token !== generation.current) return
              onChanged?.()
              setMessage('Предложение удалено')
            }),
        },
      ]
    )
  const share = (item: Proposal, copy = false) =>
    run(async () => {
      const token = generation.current
      const fresh = await proposalsApi.get(item._id, operation())
      if (!alive.current || token !== generation.current) return
      if (fresh.status !== 'published' || !fresh.renderedMessage)
        throw new Error('UNAVAILABLE_MESSAGE')
      if (copy) {
        await Clipboard.setStringAsync(fresh.renderedMessage)
        if (alive.current && token === generation.current)
          setMessage('Сообщение скопировано')
      } else await Share.share({ message: fresh.renderedMessage })
    })
  const send = (item: Proposal, retry = false) =>
    run(async () => {
      const token = generation.current
      const result = await proposalsApi.sendTelegram(
        item._id,
        retry,
        operation()
      )
      if (!alive.current || token !== generation.current) return
      setItems((values) =>
        values.map((value) =>
          value._id === result.proposal._id ? result.proposal : value
        )
      )
      const list = await proposalsApi.list(eventId, operation())
      if (!alive.current || token !== generation.current) return
      setItems(list)
      onChanged?.()
      setMessage(
        result.partial
          ? 'Часть медиа не доставлена. Повторите отправку недоставленного.'
          : 'Сообщение отправлено в Telegram'
      )
    })
  const reconcileSend = (item: Proposal) =>
    run(async () => {
      const token = generation.current
      const fresh = await proposalsApi.reconcileSend(item._id, operation())
      if (alive.current && token === generation.current)
        setItems((values) =>
          values.map((value) => (value._id === fresh._id ? fresh : value))
        )
    })
  if (eventId.startsWith('local-'))
    return (
      <Notice message="КП доступны после синхронизации работы с сервером." />
    )
  return (
    <Surface testID="event-proposals-section">
      <SectionTitle help={getFieldHelp('proposal.section')}>
        Коммерческие предложения
      </SectionTitle>
      {loading ? (
        <Notice
          message={
            items.length ? 'Обновляем предложения…' : 'Загружаем предложения…'
          }
        />
      ) : null}
      {error ? (
        <>
          <Notice tone="danger" message={error} />
          <Button
            title="Повторить загрузку КП"
            variant="secondary"
            onPress={() => void load()}
            disabled={busy}
          />
        </>
      ) : null}
      {message ? <Notice message={message} /> : null}
      {creation ? (
        <>
          <Notice
            tone="warning"
            message={
              creation.id
                ? 'Создание не подтверждено чтением. Повторите точное чтение КП.'
                : 'Результат создания неизвестен. Новое создание заблокировано: ответ сервера потерян. Проверьте список КП; автоматическое восстановление недоступно.'
            }
          />
          {creation.id ? (
            <Button
              title="Повторить чтение созданного КП"
              variant="secondary"
              disabled={busy || creation.inflight}
              onPress={() => void recoverCreation()}
            />
          ) : null}
        </>
      ) : null}
      {eventError ? (
        <>
          <Notice
            tone="warning"
            message="Статус работы не загрузился. Применение варианта недоступно до повторного чтения."
          />
          <Button
            title="Повторить чтение статуса работы"
            variant="secondary"
            disabled={busy}
            onPress={() => void load()}
          />
        </>
      ) : null}
      {templateError ? (
        <Notice
          tone="warning"
          message="Шаблоны не загрузились. Можно создать КП без шаблона или повторить загрузку."
        />
      ) : null}
      {!loading && !error && !items.length ? (
        <EmptyState title="Предложений пока нет" />
      ) : null}
      {items.map((item) => {
        const sending = proposalOperations.get(identity, 'send', item._id)
        const applying = proposalOperations.get(identity, 'apply', item._id)
        const accepted =
          ['published', 'expired'].includes(item.status) &&
          Boolean(item.selectedPackageId)
        const applied = Boolean(
          item.appliedAt &&
          item.selectedPackageId &&
          (item.appliedPackageId
            ? item.appliedPackageId === item.selectedPackageId &&
              String(item.appliedSelectionAt) === String(item.selectedAt)
            : !item.selectedAt ||
              new Date(item.selectedAt) <= new Date(item.appliedAt))
        )
        const latestDelivery = new Map(
          item.delivery?.map((entry) => [
            entry.mediaId || entry.type,
            entry.status,
          ])
        )
        const label = accepted
          ? applied
            ? 'Принято клиентом · применено'
            : 'Принято клиентом'
          : item.status === 'draft'
            ? 'Черновик'
            : item.status === 'revoked'
              ? 'Отозвано'
              : item.status === 'expired'
                ? 'Срок истёк'
                : item.sentAt
                  ? 'Отправлено'
                  : 'Опубликовано'
        return (
          <Surface key={item._id} testID={`proposal-card-${item._id}`}>
            <SectionTitle>{item.title}</SectionTitle>
            <StatusChip label={label} tone={accepted ? 'success' : 'neutral'} />
            <Notice
              message={`Версия ${item.version}${item.validUntil ? ` · до ${new Date(item.validUntil).toLocaleDateString('ru-RU')}` : ''}`}
            />
            <Button
              testID={`proposal-edit-${item._id}`}
              title={
                item.status === 'draft'
                  ? 'Редактировать'
                  : 'Создать новую версию'
              }
              variant="secondary"
              disabled={busy || (item.status !== 'draft' && Boolean(creation))}
              onPress={() =>
                item.status === 'draft'
                  ? router.push(
                      `/events/${encodeURIComponent(eventId)}/proposals/${encodeURIComponent(item._id)}` as never
                    )
                  : void create({ sourceProposalId: item._id })
              }
            />
            <Button
              title="Клонировать"
              variant="secondary"
              disabled={busy || Boolean(creation)}
              onPress={() => void create({ sourceProposalId: item._id })}
            />
            <Button
              title="Предпросмотр для клиента"
              variant="secondary"
              disabled={busy}
              onPress={() =>
                router.push(
                  `/events/${encodeURIComponent(eventId)}/proposals/${encodeURIComponent(item._id)}?preview=1` as never
                )
              }
            />
            {item.status === 'draft' ? (
              <Button
                testID={`proposal-publish-${item._id}`}
                title="Опубликовать"
                disabled={busy}
                onPress={() => action(item, 'publish')}
              />
            ) : null}
            <Button
              testID={`proposal-share-${item._id}`}
              title="Поделиться сообщением"
              variant="secondary"
              disabled={busy || item.status !== 'published'}
              onPress={() => void share(item)}
            />
            <Button
              title="Копировать сообщение"
              variant="secondary"
              disabled={busy || item.status !== 'published'}
              onPress={() => void share(item, true)}
            />
            <Button
              title="Отправить в Telegram Business"
              variant="secondary"
              disabled={
                busy ||
                item.status !== 'published' ||
                Boolean(sending) ||
                latestDelivery.size > 0
              }
              onPress={() => void send(item)}
            />
            {sending?.phase === 'unknown' ? (
              <Button
                title="Проверить доставку в Telegram"
                variant="secondary"
                disabled={busy || sending.inflight}
                onPress={() => void reconcileSend(item)}
              />
            ) : null}
            {applying ? (
              <Button
                title="Повторить чтение применённой работы"
                variant="secondary"
                disabled={busy || applying.inflight}
                onPress={() => void recoverApply(item)}
              />
            ) : null}
            {[...latestDelivery.values()].includes('failed') ||
            sending?.phase === 'partial' ? (
              <Button
                title="Повторить недоставленное в Telegram"
                variant="secondary"
                disabled={
                  busy ||
                  item.status !== 'published' ||
                  Boolean(
                    sending && (sending.inflight || sending.phase !== 'partial')
                  )
                }
                onPress={() => void send(item, true)}
              />
            ) : null}
            <Button
              testID={`proposal-apply-${item._id}`}
              title="Применить выбранный вариант"
              disabled={
                busy ||
                loading ||
                !['draft', 'active'].includes(serverStatus || '') ||
                !accepted ||
                applied ||
                Boolean(applying) ||
                ['closed', 'canceled'].includes(eventStatus || '')
              }
              onPress={() => action(item, 'apply')}
            />
            <Button
              testID={`proposal-revoke-${item._id}`}
              title="Отозвать доступ"
              variant="danger"
              disabled={
                busy ||
                Boolean(item.selectedPackageId) ||
                item.status !== 'published'
              }
              onPress={() => action(item, 'revoke')}
            />
            <Button
              testID={`proposal-delete-${item._id}`}
              title="Удалить предложение"
              variant="danger"
              disabled={busy}
              onPress={() => remove(item)}
            />
          </Surface>
        )
      })}
      <Button
        testID="proposal-create"
        title="Создать КП"
        disabled={busy || loading || Boolean(error) || Boolean(creation)}
        onPress={() => setChoosing((value) => !value)}
      />
      {choosing ? (
        <>
          <Button
            title="Без шаблона"
            variant="secondary"
            disabled={busy || Boolean(creation)}
            onPress={() => void create({})}
          />
          {templates.map((template) => (
            <Button
              key={template._id}
              title={template.name}
              variant="secondary"
              disabled={busy || Boolean(creation)}
              onPress={() => void create({ templateId: template._id })}
            />
          ))}
          <Button
            title="Отмена выбора шаблона"
            variant="secondary"
            disabled={busy}
            onPress={() => setChoosing(false)}
          />
        </>
      ) : null}
    </Surface>
  )
}
