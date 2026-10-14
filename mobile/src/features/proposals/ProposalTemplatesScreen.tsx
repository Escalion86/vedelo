import { useCallback, useRef, useState } from 'react'
import { router, useFocusEffect } from 'expo-router'
import {
  Button,
  EmptyState,
  Notice,
  PageHeader,
  Screen,
  StatusChip,
  Surface,
} from '../../shared/ui/components'
import { proposalsApi, type ProposalTemplate } from './api'
import { useProposalIdentity } from './identity'
export function ProposalTemplatesScreen() {
  const identity = useProposalIdentity()
  return identity ? <IdentityTemplates key={identity} /> : null
}
function IdentityTemplates() {
  const [items, setItems] = useState<ProposalTemplate[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('')
  const alive = useRef(false),
    generation = useRef(0),
    request = useRef(0)
  const load = useCallback(async () => {
    const token = generation.current,
      revision = ++request.current
    setLoading(true)
    setError('')
    try {
      const data = await proposalsApi.templates()
      if (
        alive.current &&
        token === generation.current &&
        revision === request.current
      )
        setItems(data)
    } catch {
      if (
        alive.current &&
        token === generation.current &&
        revision === request.current
      )
        setError('Не удалось загрузить шаблоны.')
    } finally {
      if (
        alive.current &&
        token === generation.current &&
        revision === request.current
      )
        setLoading(false)
    }
  }, [])
  useFocusEffect(
    useCallback(() => {
      alive.current = true
      generation.current++
      void load()
      return () => {
        alive.current = false
        generation.current++
      }
    }, [load])
  )
  return (
    <Screen>
      <PageHeader
        title="Шаблоны коммерческих предложений"
        subtitle="Текст, медиа и варианты услуг. DOCX-шаблоны остаются в документах."
      />
      {loading ? <Notice message="Загружаем шаблоны…" /> : null}
      {error ? (
        <>
          <Notice tone="danger" message={error} />
          <Button
            title="Повторить"
            variant="secondary"
            onPress={() => void load()}
          />
        </>
      ) : null}
      {!loading && !error && !items.length ? (
        <EmptyState
          title="Пока нет шаблонов"
          description="Создайте основу для будущих КП."
        />
      ) : null}
      {items.map((item) => (
        <Surface key={item._id}>
          <Button
            testID={`proposal-template-${item._id}`}
            title={item.name}
            variant="secondary"
            onPress={() =>
              router.push(
                `/more/proposal-templates/${encodeURIComponent(item._id)}` as never
              )
            }
          />
          <StatusChip
            label={item.status === 'archived' ? 'В архиве' : 'Активен'}
          />
        </Surface>
      ))}
      <Button
        testID="proposal-template-create"
        title="Создать шаблон"
        disabled={loading || Boolean(error)}
        onPress={() => router.push('/more/proposal-templates/new' as never)}
      />
    </Screen>
  )
}
