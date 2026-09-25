import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
const dest = path.resolve('brag-output/composition/assets')
await fs.mkdir(dest, { recursive: true })
const poster = 'public/marketing/comics/fokusniki/poster.png'
await sharp(poster).extract({ left: 5, top: 178, width: 330, height: 440 }).png().toFile(path.join(dest, 'magician-before.png'))
await sharp(poster).extract({ left: 690, top: 851, width: 328, height: 346 }).png().toFile(path.join(dest, 'magician-after.png'))
await fs.copyFile('public/brand/vedelo-mark.svg', path.join(dest, 'vedelo-mark.svg'))
for (const weight of ['Regular', 'Medium', 'SemiBold', 'Bold']) {
  await fs.copyFile(`public/fonts/InterTight-${weight}.woff2`, path.join(dest, `InterTight-${weight}.woff2`))
}
const brag = 'C:/Users/Escal/.codex/skills/brag/assets'
for (const [src, out] of [['sfx/casino/card-slide-1.ogg', 'card.ogg'], ['sfx/ui/click2.ogg', 'click.ogg'], ['sfx/impact/impactSoft_medium_001.ogg', 'soft.ogg']]) {
  await fs.copyFile(path.join(brag, src), path.join(dest, out))
}
const r = await fetch('https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js')
if (!r.ok) throw new Error(`GSAP ${r.status}`)
await fs.writeFile(path.join(dest, 'gsap.min.js'), await r.text())
console.log('Assets prepared')
