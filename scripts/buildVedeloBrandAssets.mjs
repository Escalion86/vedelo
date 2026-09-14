import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const markPath = path.join(root, 'public', 'brand', 'vedelo-mark.svg')
const wordmarkPath = path.join(root, 'public', 'brand', 'vedelo-wordmark.svg')
const mark = await fs.readFile(markPath)
const wordmark = await fs.readFile(wordmarkPath)

const ensureParent = (filePath) => fs.mkdir(path.dirname(filePath), { recursive: true })
const writePng = async (relativePath, width, height = width, source = mark) => {
  const target = path.join(root, relativePath)
  await ensureParent(target)
  await sharp(source, { density: 384 })
    .resize(width, height, { fit: 'contain', background: '#f7efe1' })
    .png()
    .toFile(target)
}

const manifest = JSON.parse(
  await fs.readFile(path.join(root, 'public', 'manifest.json'), 'utf8')
)
for (const icon of manifest.icons || []) {
  if (!icon.src?.startsWith('/') || icon.type !== 'image/png') continue
  const [width, height] = String(icon.sizes || '').split('x').map(Number)
  if (!width || !height) continue
  await writePng(path.join('public', icon.src.slice(1)), width, height)
}

for (const size of [16, 32, 36, 48, 64, 72, 96, 128, 192, 256, 384]) {
  await writePng(`public/img/logo-${size}.png`, size)
  await ensureParent(path.join(root, `public/img/logo-${size}.webp`))
  await sharp(mark, { density: 384 }).resize(size, size).webp({ quality: 92 }).toFile(path.join(root, `public/img/logo-${size}.webp`))
  await ensureParent(path.join(root, `public/img/logo-${size}.avif`))
  await sharp(mark, { density: 384 }).resize(size, size).avif({ quality: 82 }).toFile(path.join(root, `public/img/logo-${size}.avif`))
}

await writePng('public/img/logo.png', 512)
await sharp(mark, { density: 384 }).resize(512, 512).webp({ quality: 94 }).toFile(path.join(root, 'public', 'logo.webp'))
await sharp(mark, { density: 384 }).resize(512, 512).webp({ quality: 94 }).toFile(path.join(root, 'public', 'img', 'logo.webp'))
await sharp(mark, { density: 384 }).resize(512, 512).avif({ quality: 84 }).toFile(path.join(root, 'public', 'img', 'logo.avif'))
await sharp(wordmark, { density: 384 }).resize(896, 224).png().toFile(path.join(root, 'public', 'img', 'logo_horizontal.png'))
await writePng('mobile/assets/images/icon.png', 1024)
await writePng('mobile/assets/images/brand-mark.png', 512)
await writePng('mobile/assets/images/adaptive-icon.png', 1024)
await writePng('mobile/assets/images/favicon.png', 64)
await sharp(mark, { density: 384 }).resize(1024, 1024).extend({ top: 300, bottom: 300, left: 0, right: 0, background: '#f7efe1' }).png().toFile(path.join(root, 'mobile', 'assets', 'images', 'splash.png'))
await sharp(mark, { density: 384 }).resize(96, 96).flatten({ background: '#000000' }).threshold(190).png().toFile(path.join(root, 'mobile', 'assets', 'images', 'notification-icon.png'))

console.log('Графика «Ведело» собрана')
