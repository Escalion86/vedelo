import { clearNativeIntent, pendingNativeIntent, queueNativeIntent, resetNativeIntents, resolveNativeDestination, resolveNotificationDestination, setNativeIntentIdentity } from './intents'
import { redirectSystemPath } from '../../../app/+native-intent'
const id = 'a'.repeat(24)
it('assistant links retain entity access checks and cannot inject preview data or a stored plan', () => {
  expect(resolveNativeDestination(`vedelo://events/assistant?mode=text&eventId=${id}&aiPlan=foreign&aiDraft=other&shareDraft=private&text=injected`))
    .toEqual({ href: `/events/assistant?mode=text&eventId=${id}`, entity: { kind: 'events', id } })
  expect(resolveNativeDestination('vedelo://events/assistant?eventId=local-private')).toBeNull()
})
beforeEach(resetNativeIntents)
it.each(['vedelo', 'artistcrm', 'vedelo-dev', 'artistcrm-dev'])('accepts %s entity links and strips unrelated parameters', scheme => {
  expect(resolveNativeDestination(`${scheme}://events/${id}?tenantId=evil`)).toEqual({ href: `/events/${id}`, entity: { kind: 'events', id } })
})
it.each(['https://evil.example/cabinet/events?openEvent=aaaaaaaaaaaaaaaaaaaaaaaa', 'vedelo://more/users', 'vedelo://api/events', 'vedelo://events/$ne', 'file:///events/aaaaaaaaaaaaaaaaaaaaaaaa', 'javascript:alert(1)', 'vedelo://events/%2fadmin', 'vedelo://user:password@events/aaaaaaaaaaaaaaaaaaaaaaaa'])('rejects untrusted or privileged link %s', path => {
  expect(resolveNativeDestination(path)).toBeNull()
})
it('maps PWA notifications, shortcuts and caller links without accepting arbitrary navigation', () => {
  expect(resolveNativeDestination(`https://vedelo.ru/cabinet/eventsUpcoming?openEvent=${id}`)?.href).toBe(`/events/${id}`)
  expect(resolveNativeDestination('vedelo://events/edit/new?initialStatus=draft&mode=voice&source=admin')?.href).toBe('/events/assistant?mode=voice')
  expect(resolveNativeDestination('vedelo://native/caller?number=%2B79991234567')?.href).toBe('/native/caller?number=%2B79991234567')
})
it('keeps a cold link through login, clears it on account change and ignores late completion of an older intent', () => {
  const old = queueNativeIntent(`/events/${id}`)!
  setNativeIntentIdentity('account-a')
  expect(pendingNativeIntent()?.key).toBe(old.key)
  const latest = queueNativeIntent('/native/settings')!
  clearNativeIntent(old.key); expect(pendingNativeIntent()?.key).toBe(latest.key)
  setNativeIntentIdentity('account-b'); expect(pendingNativeIntent()).toBeNull()
  queueNativeIntent('/native/settings'); resetNativeIntents(); expect(pendingNativeIntent()).toBeNull()
})
it('never queues OAuth codes and preserves a registration referral', () => {
  expect(redirectSystemPath({ path: 'vedelo://auth/vk?code=private', initial: false })).toBe('/(auth)/login')
  expect(pendingNativeIntent()).toBeNull()
  expect(redirectSystemPath({ path: `vedelo://?ref=${id}`, initial: true })).toBe(`/(auth)/login?mode=register&ref=${id}`)
  expect(redirectSystemPath({ path: `artistcrm://clients/${id}`, initial: true })).toMatch(/^\/native\/open\?intent=\d+$/)
})
it('share intents contain only an opaque ID and survive initial login, then clear on logout', () => {
  const shareId = '11111111-1111-4111-8111-111111111111'
  resetNativeIntents()
  queueNativeIntent(`vedelo://native/share?shareId=${shareId}&text=untrusted`)
  expect(pendingNativeIntent()?.destination.href).toBe(`/native/share?shareId=${shareId}`)
  setNativeIntentIdentity('user-a')
  expect(pendingNativeIntent()?.destination.href).toContain(shareId)
  resetNativeIntents(); expect(pendingNativeIntent()).toBeNull()
  expect(resolveNativeDestination('vedelo://native/share?shareId=../../private')).toEqual({ href: '/native/share' })
})
it('opens messenger pushes as conversations and keeps client ownership validation', () => {
  const url = resolveNotificationDestination({ type: 'incoming_messenger_message', clientId: id, url: `/events/${id}` })
  expect(resolveNativeDestination(url)).toEqual({ href: `/conversations?clientId=${id}`, entity: { kind: 'clients', id } })
  expect(resolveNativeDestination(`https://vedelo.ru/cabinet/clients?openMessenger=${id}`)).toEqual(resolveNativeDestination(url))
  expect(resolveNativeDestination(resolveNotificationDestination({ type: 'incoming_messenger_message', provider: 'telegram', conversationId: id }))?.href).toBe(`/conversations/telegram/${id}`)
  expect(resolveNotificationDestination({ type: 'incoming_messenger_message', clientId: '../admin' })).toBe('/conversations')
})
it('validates task-action links and checks the owning order before opening confirmation', () => {
  const url = `/native/task-action?eventId=${id}&taskId=${id}&action=complete`
  expect(resolveNativeDestination(url)).toEqual({ href: url, entity: { kind: 'events', id } })
  expect(resolveNativeDestination(url.replace('complete', 'delete'))).toBeNull()
  expect(resolveNativeDestination(url.replace(`taskId=${id}`, 'taskId=../other'))).toBeNull()
})
