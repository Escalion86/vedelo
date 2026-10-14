// Fixture finalization only: no subprocesses and no production changes.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const sharp = require('sharp')
const { fixtureDir, unknownClusters, paddedMp4 } = require('./media.stageH.cjs')
async function main() {
  fs.writeFileSync(path.join(fixtureDir, 'unknown-clusters.webm'), unknownClusters(fs.readFileSync(path.join(fixtureDir, 'stream.webm'))), { flag: 'wx' })
  fs.writeFileSync(path.join(process.env.TMPDIR, 'stageH-free45.mp4'), paddedMp4(45), { flag: 'wx' })
  const positive = fs.readFileSync(path.join(fixtureDir, 'animated-128x128x50.gif'))
  const metadata = await sharp(positive, { animated: true, limitInputPixels: 40000000, failOn: 'warning' }).metadata()
  assert.equal(metadata.width, 128)
  assert.equal(metadata.pageHeight, 128)
  assert.equal(metadata.pages, 50)
  const reencoded = await sharp(positive, { animated: true, limitInputPixels: 40000000, failOn: 'warning' }).gif().toBuffer()
  const negative = await sharp(path.join(fixtureDir, 'over-40M.gif'), { animated: true, limitInputPixels: false }).metadata()
  assert.ok(negative.width * negative.height > 40000000)
  const facts = {
    positiveGif: { width: metadata.width, height: metadata.height, pageHeight: metadata.pageHeight, pages: metadata.pages, actualPixels: metadata.width * metadata.height, reencodedBytes: reencoded.length },
    negativeGif: { width: negative.width, height: negative.height, pages: negative.pages, actualPixels: negative.width * negative.height },
  }
  console.log(JSON.stringify(facts))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
