import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

const projectRoot = process.cwd()
const sourceRoot = path.join(projectRoot, 'assets', 'marketing', 'comics')
const outputRoot = path.join(projectRoot, 'public', 'marketing', 'comics')
const { comics } = JSON.parse(await readFile(path.join(sourceRoot, 'manifest.json'), 'utf8'))
const background = '#080b0d'
const brandMark = (await readFile(path.join(projectRoot, 'public', 'brand', 'vedelo-mark.svg'))).toString('base64')
const ffmpegCheck = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' })
if (ffmpegCheck.error || ffmpegCheck.status !== 0) {
  throw new Error('Для сборки роликов установите ffmpeg и добавьте его в PATH.')
}

// Reviewed coordinates account for different panel boundaries in each poster.
const sources = await Promise.all(comics.map(async (comic) => {
  const source = path.join(sourceRoot, comic.slug + '.png')
  const metadata = await sharp(source).metadata()
  const { x, y } = comic.grid
  if (x.length !== 4 || y.length !== 3 || x[0] !== 0 || y[0] !== 0 ||
      x[3] !== metadata.width || y[2] >= metadata.height ||
      x.some((n, i) => i > 0 && n <= x[i - 1]) ||
      y.some((n, i) => i > 0 && n <= y[i - 1])) {
    throw new Error('Некорректная сетка: ' + comic.slug)
  }
  return { ...comic, source }
}))

function footer() {
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="148"><rect width="1080" height="148" fill="' + background + '"/><path d="M50 1H1030" stroke="#c39656" stroke-width="3"/><image href="data:image/svg+xml;base64,' + brandMark + '" x="54" y="23" width="64" height="64"/><text x="134" y="73" font-family="Arial, sans-serif" font-size="58" font-weight="700" fill="#e8bd7b">Ведело</text><text x="1026" y="73" text-anchor="end" font-family="Arial, sans-serif" font-size="42" fill="#f7f0e4">vedelo.ru</text><text x="54" y="123" font-family="Arial, sans-serif" font-size="29" fill="#e6ded2">Меньше рутины. Больше дела.</text></svg>')
}

function posterFooter(width, height) {
  const top = Math.floor((height - 106) / 2)
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1024 ${height}"><rect width="1024" height="${height}" fill="${background}"/><path d="M0 1H1024" stroke="#c39656" stroke-width="3"/><g transform="translate(0 ${top})"><image href="data:image/svg+xml;base64,${brandMark}" x="28" y="10" width="88" height="88"/><text x="134" y="68" font-family="Arial, sans-serif" font-size="64" font-weight="700" fill="#e8bd7b">Ведело</text><text x="136" y="98" font-family="Arial, sans-serif" font-size="20" fill="#e6ded2">CRM для вашего дела</text><path d="M452 16V96" stroke="#c39656"/><text x="488" y="52" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#e8bd7b">vedelo.ru</text><text x="488" y="90" font-family="Arial, sans-serif" font-size="25" fill="#f7f0e4">Меньше рутины. Больше дела.</text></g></svg>`)
}

async function card(frame, height) {
  const width = 1080
  const artwork = await sharp(frame).resize(width - 72, height - 200, {
    fit: 'inside', withoutEnlargement: false,
  }).png().toBuffer({ resolveWithObject: true })
  return sharp({ create: { width, height, channels: 3, background } }).composite([
    { input: artwork.data, left: Math.floor((width - artwork.info.width) / 2), top: Math.floor((height - 170 - artwork.info.height) / 2) },
    { input: footer(), left: 0, top: height - 148 },
  ])
}

for (const comic of sources) {
  const destination = path.join(outputRoot, comic.slug)
  await mkdir(path.join(destination, 'carousel'), { recursive: true })
  await mkdir(path.join(destination, 'ads'), { recursive: true })
  const temporaryFrames = await mkdtemp(path.join(os.tmpdir(), 'vedelo-comic-'))
  try {
    const metadata = await sharp(comic.source).metadata()
    const footerTop = comic.grid.y[2]
    const poster = sharp(comic.source).composite([{
      input: posterFooter(metadata.width, metadata.height - footerTop),
      left: 0, top: footerTop,
    }])
    await poster.clone().png().toFile(path.join(destination, 'poster.png'))
    await poster.clone().webp({ quality: 93 }).toFile(path.join(destination, 'poster.webp'))
    const frames = []
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        const left = comic.grid.x[column] + (column ? 3 : 0)
        const top = comic.grid.y[row] + (row ? 3 : 0)
        const frame = await sharp(comic.source).extract({
          left, top,
          width: comic.grid.x[column + 1] - left - 3,
          height: comic.grid.y[row + 1] - top - 3,
        }).png().toBuffer()
        frames.push(frame)
        const name = String(frames.length).padStart(2, '0')
        const slide = await card(frame, 1920)
        await slide.clone().webp({ quality: 92 }).toFile(path.join(destination, 'carousel', name + '.webp'))
        await slide.clone().jpeg({ quality: 94 }).toFile(path.join(temporaryFrames, name + '.jpg'))
      }
    }
    for (const [name, index] of [['zayavki', 0], ['detali-zakaza', 2], ['zadatki-i-dela', 3]]) {
      await (await card(frames[index], 1350)).webp({ quality: 92 }).toFile(path.join(destination, 'ads', name + '.webp'))
    }
    // Keep previously distributed URLs usable, with updated order-details copy.
    if (comic.legacyAiAsset) {
      await (await card(frames[2], 1350)).webp({ quality: 92 }).toFile(path.join(destination, 'ads', 'ai-chernovik.webp'))
    }
    const ffmpeg = spawnSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-framerate', '1/3',
      '-i', path.join(temporaryFrames, '%02d.jpg'),
      '-vf', 'fade=t=in:st=0:d=0.3,fade=t=out:st=17.6:d=0.4,format=yuv420p',
      '-c:v', 'libx264', '-r', '30', '-movflags', '+faststart',
      path.join(destination, 'comic-vertical.mp4'),
    ], { encoding: 'utf8' })
    if (ffmpeg.error || ffmpeg.status !== 0) {
      throw new Error('Не удалось собрать ' + comic.slug + ': ' + (ffmpeg.stderr || ffmpeg.error))
    }
    console.log('Готово: ' + comic.title)
  } finally {
    // Remove only the exact temporary directory created for this comic.
    const resolved = path.resolve(temporaryFrames)
    if (path.dirname(resolved) === path.resolve(os.tmpdir()) &&
        path.basename(resolved).startsWith('vedelo-comic-')) {
      await rm(resolved, { recursive: true, force: true })
    }
  }
}

const thumbnails = await Promise.all(sources.map(async (comic, index) => ({
  input: await sharp(path.join(outputRoot, comic.slug, 'poster.png')).resize(384, 576).png().toBuffer(),
  left: (index % 4) * 400 + 8,
  top: Math.floor(index / 4) * 592 + 8,
})))
await sharp({ create: { width: 1600, height: 1184, channels: 3, background } })
  .composite(thumbnails).webp({ quality: 90 }).toFile(path.join(outputRoot, 'collection.webp'))
console.log('Маркетинговые материалы собраны в ' + outputRoot)
