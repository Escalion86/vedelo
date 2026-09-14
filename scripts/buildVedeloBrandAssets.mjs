import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const markPath = path.join(root, 'public', 'brand', 'vedelo-mark.svg')
const wordmarkPath = path.join(root, 'public', 'brand', 'vedelo-wordmark.svg')
const mark = await fs.readFile(markPath)
const wordmark = await fs.readFile(wordmarkPath)
const notificationMark = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <mask id="glyph" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
      <rect width="512" height="512" fill="#000"/>
      <path d="M112 80h158c74 0 118 34 118 92 0 30-15 53-46 68l-100 82-130-115V80Zm0 122 133 113 54-52c64 9 105 47 105 95 0 50-52 74-140 74H112V202Z" fill="#fff"/>
      <path d="m151 260 59 58 105-116" fill="none" stroke="#000" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>
    </mask>
    <rect width="512" height="512" fill="#fff" mask="url(#glyph)"/>
  </svg>
`)

const ensureParent = (filePath) => fs.mkdir(path.dirname(filePath), { recursive: true })
const fileExists = async (filePath) => {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

const renderMarkPng = (width, height = width) =>
  sharp(mark, { density: 384 })
    .resize(width, height, { fit: 'contain', background: '#f7efe1' })
    .png()
    .toBuffer()

const writePng = async (relativePath, width, height = width, source = mark) => {
  const target = path.join(root, relativePath)
  await ensureParent(target)
  const png =
    source === mark
      ? await renderMarkPng(width, height)
      : await sharp(source, { density: 384 })
          .resize(width, height, { fit: 'contain', background: '#f7efe1' })
          .png()
          .toBuffer()
  await fs.writeFile(target, png)
}

const writeIco = async (relativePath, sizes) => {
  const images = await Promise.all(sizes.map((size) => renderMarkPng(size)))
  const headerSize = 6 + images.length * 16
  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  let offset = headerSize
  images.forEach((image, index) => {
    const size = sizes[index]
    const entry = 6 + index * 16
    header.writeUInt8(size === 256 ? 0 : size, entry)
    header.writeUInt8(size === 256 ? 0 : size, entry + 1)
    header.writeUInt8(0, entry + 2)
    header.writeUInt8(0, entry + 3)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(image.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += image.length
  })

  const target = path.join(root, relativePath)
  await ensureParent(target)
  await fs.writeFile(target, Buffer.concat([header, ...images]))
}

const manifest = JSON.parse(
  await fs.readFile(path.join(root, 'public', 'manifest.json'), 'utf8')
)
for (const icon of manifest.icons || []) {
  if (!icon.src?.startsWith('/') || icon.type !== 'image/png') continue
  const [width, height] = String(icon.sizes || '').split('x').map(Number)
  if (!width || !height) continue
  const pngPath = path.join('public', icon.src.slice(1))
  const assetBasePath = pngPath.replace(/\.png$/i, '')
  await writePng(pngPath, width, height)

  const webpPath = `${assetBasePath}.webp`
  if (await fileExists(path.join(root, webpPath))) {
    await sharp(mark, { density: 384 })
      .resize(width, height, { fit: 'contain', background: '#f7efe1' })
      .webp({ quality: 92 })
      .toFile(path.join(root, webpPath))
  }

  const avifPath = `${assetBasePath}.avif`
  if (await fileExists(path.join(root, avifPath))) {
    await sharp(mark, { density: 384 })
      .resize(width, height, { fit: 'contain', background: '#f7efe1' })
      .avif({ quality: 82 })
      .toFile(path.join(root, avifPath))
  }
}

for (const size of [16, 32, 36, 48, 64, 72, 96, 128, 192, 256, 384]) {
  await writePng(`public/img/logo-${size}.png`, size)
  await ensureParent(path.join(root, `public/img/logo-${size}.webp`))
  await sharp(mark, { density: 384 }).resize(size, size).webp({ quality: 92 }).toFile(path.join(root, `public/img/logo-${size}.webp`))
  await ensureParent(path.join(root, `public/img/logo-${size}.avif`))
  await sharp(mark, { density: 384 }).resize(size, size).avif({ quality: 82 }).toFile(path.join(root, `public/img/logo-${size}.avif`))
}

await writePng('public/img/logo.png', 512)
await writePng('public/favicon.png', 32)
await sharp(mark, { density: 384 }).resize(32, 32).webp({ quality: 92 }).toFile(path.join(root, 'public', 'favicon.webp'))
await sharp(mark, { density: 384 }).resize(32, 32).avif({ quality: 82 }).toFile(path.join(root, 'public', 'favicon.avif'))
await sharp(mark, { density: 384 }).resize(512, 512).webp({ quality: 94 }).toFile(path.join(root, 'public', 'logo.webp'))
await sharp(mark, { density: 384 }).resize(512, 512).avif({ quality: 84 }).toFile(path.join(root, 'public', 'logo.avif'))
await sharp(mark, { density: 384 }).resize(512, 512).webp({ quality: 94 }).toFile(path.join(root, 'public', 'img', 'logo.webp'))
await sharp(mark, { density: 384 }).resize(512, 512).avif({ quality: 84 }).toFile(path.join(root, 'public', 'img', 'logo.avif'))
await sharp(wordmark, { density: 384 }).resize(896, 224).png().toFile(path.join(root, 'public', 'img', 'logo_horizontal.png'))
await writeIco('app/favicon.ico', [16, 32, 48, 256])
await writePng('mobile/assets/images/icon.png', 1024)
await writePng('mobile/assets/images/brand-mark.png', 512)
await writePng('mobile/assets/images/adaptive-icon.png', 1024)
await writePng('mobile/assets/images/favicon.png', 64)
await sharp(mark, { density: 384 }).resize(1024, 1024).extend({ top: 300, bottom: 300, left: 0, right: 0, background: '#f7efe1' }).png().toFile(path.join(root, 'mobile', 'assets', 'images', 'splash.png'))
await sharp(notificationMark, { density: 384 })
  .resize(96, 96)
  .png()
  .toFile(path.join(root, 'mobile', 'assets', 'images', 'notification-icon.png'))

console.log('Графика «Ведело» собрана')
