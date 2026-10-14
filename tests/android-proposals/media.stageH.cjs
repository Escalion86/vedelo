const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const fixtureDir = path.join(__dirname, 'fixtures.stageH')
const read = name => fs.readFileSync(path.join(fixtureDir, name))
const box = (type, data) => {
  const header = Buffer.alloc(8)
  header.writeUInt32BE(8 + data.length)
  header.write(type, 4)
  return Buffer.concat([header, data])
}
function boxes(bytes, start = 0, end = bytes.length) {
  const result = []
  for (let offset = start; offset < end;) {
    let size = bytes.readUInt32BE(offset), header = 8
    if (size === 1) { size = Number(bytes.readBigUInt64BE(offset + 8)); header = 16 }
    if (!size) size = end - offset
    assert.ok(size >= header && offset + size <= end, 'fixture box bounds')
    result.push({ type: bytes.toString('ascii', offset + 4, offset + 8), start: offset, data: offset + header, end: offset + size })
    offset += size
  }
  return result
}
function mp4Path(bytes, names) {
  let item = { data: 0, end: bytes.length }
  for (const name of names) {
    item = boxes(bytes, item.data, item.end).find(x => x.type === name)
    assert.ok(item, `fixture has ${name}`)
  }
  return item
}
function ebmlElements(bytes, start, end) {
  const result = []
  for (let offset = start; offset < end;) {
    const itemStart = offset
    let idLength = 1
    while (!(bytes[offset] & (0x80 >> (idLength - 1)))) idLength++
    assert.ok(idLength <= 4)
    const id = bytes.subarray(offset, offset + idLength).toString('hex')
    offset += idLength
    const sizeStart = offset
    let sizeLength = 1
    while (!(bytes[offset] & (0x80 >> (sizeLength - 1)))) sizeLength++
    assert.ok(sizeLength <= 8)
    let size = BigInt(bytes[offset] & ((0x80 >> (sizeLength - 1)) - 1))
    for (let i = 1; i < sizeLength; i++) size = (size << 8n) | BigInt(bytes[offset + i])
    const unknown = size === (1n << BigInt(7 * sizeLength)) - 1n
    const data = offset + sizeLength, itemEnd = unknown ? end : data + Number(size)
    assert.ok(itemEnd <= end && itemEnd > itemStart, 'fixture EBML bounds')
    result.push({ id, start: itemStart, sizeStart, sizeLength, data, end: itemEnd, unknown })
    offset = itemEnd
  }
  return result
}
function webmPath(bytes, names) {
  let item = { data: 0, end: bytes.length }
  for (const id of names) {
    item = ebmlElements(bytes, item.data, item.end).find(x => x.id === id)
    assert.ok(item, `fixture has EBML ${id}`)
  }
  return item
}
const segment = '18538067', tracks = '1654ae6b', cluster = '1f43b675'
function paddedMp4(sizeMiB) {
  const bytes = read('regular.mp4')
  return Buffer.concat([bytes, box('free', Buffer.alloc(sizeMiB * 1024 * 1024 - bytes.length - 8))])
}
function unknownClusters(bytes) {
  const result = Buffer.from(bytes), parent = webmPath(bytes, [segment])
  const clusters = ebmlElements(bytes, parent.data, parent.end).filter(x => x.id === cluster)
  assert.ok(clusters.length >= 2, 'real streaming fixture has sibling Clusters')
  for (const item of clusters) {
    result.fill(0xff, item.sizeStart, item.data)
    result[item.sizeStart] = (1 << (9 - item.sizeLength)) - 1
  }
  return result
}
// Exact reviewer scenarios are retained as bytes, with no reviewer-scratch reads.
function reviewerMp4() {
  const html = Buffer.from('<html><script>attack()</script></html>')
  return Buffer.concat([box('ftyp', Buffer.from('isom\0\0\0\0isom')), box('moov', html), box('mdat', html)])
}
function reviewerWebm(payload = Buffer.from('x')) {
  const element = (id, data) => {
    assert.ok(data.length < 127)
    return Buffer.concat([Buffer.from(id, 'hex'), Buffer.from([0x80 | data.length]), data])
  }
  return Buffer.concat([
    element('1a45dfa3', element('4282', Buffer.from('webm'))),
    element(segment, Buffer.concat(['1549a966', tracks, cluster].map(id => element(id, payload)))),
  ])
}
function invalidCases() {
  const mp4 = read('regular.mp4'), webm = read('stream.webm')
  const moov = mp4Path(mp4, ['moov']), mvhd = mp4Path(mp4, ['moov', 'mvhd'])
  const damagedMoov = Buffer.from(mp4)
  damagedMoov.writeUInt32BE(moov.end - mvhd.start + 1, mvhd.start)
  const htmlMoov = Buffer.from(mp4)
  htmlMoov.fill(0, moov.data, moov.end)
  htmlMoov.write('<html><script>attack()</script></html>', moov.data)
  const damagedTracks = Buffer.from(webm), entry = webmPath(webm, [segment, tracks, 'ae'])
  // A complete outer Tracks master containing a child longer than that master.
  damagedTracks.fill(0xff, entry.sizeStart, entry.data)
  damagedTracks[entry.sizeStart] = (1 << (9 - entry.sizeLength)) - 1
  damagedTracks[entry.data - 1] &= 0xfe
  const damagedCluster = Buffer.from(webm), firstCluster = webmPath(webm, [segment, cluster])
  const block = ebmlElements(webm, firstCluster.data, firstCluster.end).find(x => x.id === 'a3')
  assert.ok(block, 'ffmpeg made a SimpleBlock')
  damagedCluster.fill(0xff, block.sizeStart, block.data)
  damagedCluster[block.sizeStart] = (1 << (9 - block.sizeLength)) - 1
  damagedCluster[block.data - 1] &= 0xfe
  const invalidTrackBlock = Buffer.from(webm)
  invalidTrackBlock[block.data] = 0x80 // TrackNumber zero is invalid.
  const damagedTable = Buffer.from(mp4)
  const stsz = mp4Path(mp4, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsz'])
  damagedTable.writeUInt32BE(0x7fffffff, stsz.data + 8)
  const fragmented = read('fragmented.mp4'), damagedFragment = Buffer.from(fragmented)
  const trun = mp4Path(fragmented, ['moof', 'traf', 'trun'])
  damagedFragment.writeUInt32BE(0x7fffffff, trun.data + 4)
  return [
    ['reviewer-html-moov-mdat', reviewerMp4(), 'video/mp4'],
    ['reviewer-x-Info-Tracks-Cluster', reviewerWebm(), 'video/webm'],
    ['html-Info-Tracks-Cluster', reviewerWebm(Buffer.from('<html>attack</html>')), 'video/webm'],
    ['real-mp4-damaged-moov-child', damagedMoov, 'video/mp4'],
    ['real-mp4-html-moov', htmlMoov, 'video/mp4'],
    ['real-mp4-damaged-sample-table', damagedTable, 'video/mp4'],
    ['real-mp4-damaged-fragment', damagedFragment, 'video/mp4'],
    ['real-webm-damaged-Tracks-child', damagedTracks, 'video/webm'],
    ['real-webm-damaged-Cluster-block', damagedCluster, 'video/webm'],
    ['real-webm-invalid-block-track', invalidTrackBlock, 'video/webm'],
    ['real-mp4-no-video-track', read('audio-only.mp4'), 'video/mp4'],
    ['real-webm-no-video-track', read('audio-only.webm'), 'video/webm'],
    ['html-claimed-image-png', Buffer.from('<html><script>attack()</script></html>'), 'image/png'],
  ]
}
module.exports = { fixtureDir, read, boxes, mp4Path, ebmlElements, webmPath, paddedMp4, unknownClusters, invalidCases }
