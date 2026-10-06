import { readReferrals, referralLink, referralName } from './referrals'
const user = { _id: 'a'.repeat(24), firstName: 'Анна', secondName: 'Иванова', thirdName: 'Петровна', registrationType: 'phone', createdAt: '2026-10-01T00:00:00Z' }
const data = { referralsCount: 1, rewardsTotal: 50, rewardsCount: 2, referrals: [{ user, rewardsTotal: 50, rewardsCount: 2, lastRewardAt: null }] }
test('buildReferralRows shape сохраняет имя, сумму, число и даты', () => { expect(readReferrals({ success: true, data })).toEqual(data); expect(referralName(user)).toBe('Иванова Анна Петровна') })
test('пустой валидный mine DTO', () => { expect(readReferrals({ success: true, data: { referrals: [], referralsCount: 0, rewardsCount: 0, rewardsTotal: 0 } }).referrals).toEqual([]) })
test.each([{ success: false, data }, { success: true, data: { groups: [] } }, { success: true, data: { ...data, referrals: [user] } }, { success: true, data: { ...data, rewardsTotal: NaN } }, { success: true, data: { ...data, referralsCount: 2 } }])('неподдержанный/административный DTO отвергается', (response) => expect(() => readReferrals(response)).toThrow())
test('ссылка из origin конфигурации, user ID сохраняется без нормализации', () => {
  expect(referralLink('https://new.example/api', user._id.toUpperCase())).toBe(`https://new.example/login?mode=register&ref=${user._id.toUpperCase()}`)
  expect(referralLink('http://localhost:3000/api', user._id)).toContain('http://localhost:3000/login?')
})
test.each(['javascript:alert(1)', 'https://bearer:secret@example.com/api', 'not-url'])('небезопасный origin не даёт ссылку', (url) => expect(referralLink(url, user._id)).toBe(''))
test.each(['', ' x'+user._id, user._id+' ', '../events', 'https://example.com'])('невалидный ID не даёт ссылку', (id) => expect(referralLink('https://example.com/api', id)).toBe(''))
