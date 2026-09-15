const indexNowKey =
  process.env.INDEXNOW_KEY || 'cac7028067b34e49ad316b94dae4a065'
const defaultPaths = [
  '/',
  '/crm-dlya-fokusnikov',
  '/crm-dlya-artistov',
  '/crm-dlya-vedushchih',
  '/crm-dlya-muzykantov',
  '/crm-dlya-vyezdnyh-masterov',
  '/crm-dlya-fotografov',
  '/crm-dlya-dekoratorov',
  '/crm-dlya-chastnyh-specialistov',
  '/crm-dlya-tilda-zayavok',
  '/crm-s-google-calendar',
  '/kak-artistu-ne-teryat-zayavki-iz-messendzherov',
  '/kak-kontrolirovat-zadatki-za-vystupleniya',
  '/crm-ili-google-kalendar-dlya-artista',
  '/kak-vesti-zayavki-fokusniku',
  '/kak-ponyat-svobodna-li-data-meropriyatiya',
]

const rawSiteUrl = process.env.DOMAIN || 'https://vedelo.ru'
const siteUrl = new URL(
  rawSiteUrl.startsWith('http') ? rawSiteUrl : `https://${rawSiteUrl}`
)
siteUrl.pathname = '/'
siteUrl.search = ''
siteUrl.hash = ''

const requestedPaths = process.argv.slice(2)
const paths = requestedPaths.length > 0 ? requestedPaths : defaultPaths
const urlList = paths.map((path) => {
  const url = new URL(path, siteUrl)
  if (url.host !== siteUrl.host) {
    throw new Error(`IndexNow URL должен относиться к ${siteUrl.host}: ${url}`)
  }
  return url.toString()
})

const keyLocation = new URL(`/${indexNowKey}.txt`, siteUrl).toString()
const keyResponse = await fetch(keyLocation)
if (!keyResponse.ok || (await keyResponse.text()).trim() !== indexNowKey) {
  throw new Error(`IndexNow-ключ недоступен по адресу ${keyLocation}`)
}

const response = await fetch('https://yandex.com/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: siteUrl.host,
    key: indexNowKey,
    keyLocation,
    urlList,
  }),
})

if (!response.ok) {
  const responseText = await response.text()
  throw new Error(
    `IndexNow отклонил запрос: ${response.status} ${responseText}`.trim()
  )
}

console.log(`IndexNow принял ${urlList.length} URL, HTTP ${response.status}.`)
urlList.forEach((url) => console.log(`- ${url}`))
