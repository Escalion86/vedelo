// Bounded container validation, not codec decoding. Payloads stay opaque; all
// sizes, sample/chunk references and block headers are checked before upload.
// Structure references: W3C ISOBMFF byte stream format; RFC 8794; Matroska schema.
const MAX_BYTES = 50 * 1024 * 1024
const MAX_NODES = 50000
const MAX_STEPS = 1000000
const MAX_DEPTH = 16
const fail = () => { throw new Error('Invalid video container') }
const need = (condition) => { if (!condition) fail() }
const budget = () => ({ nodes: MAX_NODES, steps: MAX_STEPS })
const step = (b, n = 1) => { need(Number.isSafeInteger(n) && n >= 0 && (b.steps -= n) >= 0) }
const length = (node) => node.end - node.data
const fits = (node, offset, size) => need(offset >= node.data && size >= 0 && offset + size <= node.end)
const u32 = (bytes, node, offset) => { fits(node, offset, 4); return bytes.readUInt32BE(offset) }
const u64 = (bytes, node, offset) => {
  fits(node, offset, 8)
  const value = bytes.readBigUInt64BE(offset)
  need(value <= BigInt(Number.MAX_SAFE_INTEGER))
  return Number(value)
}
const one = (nodes, type, required = true) => {
  const found = nodes.filter((node) => node.type === type)
  need(found.length <= 1 && (!required || found.length === 1))
  return found[0]
}
const full = (bytes, node, versions = [0]) => {
  fits(node, node.data, 4)
  const version = bytes[node.data]
  need(versions.includes(version))
  return { version, flags: bytes.readUIntBE(node.data + 1, 3) }
}

const mp4Masters = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'dinf', 'edts', 'mvex', 'moof', 'traf'])
function mp4Boxes(bytes, start, end, b, depth = 0, descend = true) {
  need(depth <= MAX_DEPTH)
  const nodes = []
  for (let offset = start; offset < end;) {
    step(b); need(--b.nodes >= 0 && offset + 8 <= end)
    let size = bytes.readUInt32BE(offset), header = 8
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    if (size === 1) {
      need(offset + 16 <= end)
      const large = bytes.readBigUInt64BE(offset + 8)
      need(large <= BigInt(end - offset)); size = Number(large); header = 16
    } else if (!size) size = end - offset
    need(size >= header && size <= end - offset)
    const node = { type, start: offset, data: offset + header, end: offset + size }
    if (descend && mp4Masters.has(type)) node.children = mp4Boxes(bytes, node.data, node.end, b, depth + 1)
    nodes.push(node); offset = node.end
  }
  return nodes
}
function table(bytes, node, stride, b, prefix = 8) {
  full(bytes, node)
  const count = u32(bytes, node, node.data + prefix - 4)
  step(b, count)
  need(length(node) === prefix + count * stride)
  return count
}
function inMedia(ranges, start, size) {
  need(Number.isSafeInteger(start) && Number.isSafeInteger(size) && size > 0)
  let lo = 0, hi = ranges.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, range = ranges[mid]
    if (start < range.data) hi = mid - 1
    else if (start >= range.end) lo = mid + 1
    else { need(size <= range.end - start); return }
  }
  fail()
}
function avcConfig(bytes, node) {
  need(length(node) >= 7 && bytes[node.data] === 1)
  let p = node.data + 6
  const arrays = [bytes[node.data + 5] & 31]
  // SPS and PPS records carry lengths, not untrusted recursive descriptors.
  for (let group = 0; group < 2; group++) {
    const count = group ? bytes[p++] : arrays[0]
    need(p <= node.end)
    for (let i = 0; i < count; i++) {
      fits(node, p, 2); const size = bytes.readUInt16BE(p); p += 2
      need(size > 0); fits(node, p, size); p += size
    }
  }
  // Optional high-profile extension is length checked as well.
  if (p < node.end) {
    fits(node, p, 4); p += 3; const count = bytes[p++]
    for (let i = 0; i < count; i++) {
      fits(node, p, 2); const size = bytes.readUInt16BE(p); p += 2
      need(size > 0); fits(node, p, size); p += size
    }
  }
  need(p === node.end)
}
function descriptions(bytes, stsd, video, references, b) {
  full(bytes, stsd)
  const count = u32(bytes, stsd, stsd.data + 4)
  need(count > 0 && count <= 64)
  const entries = mp4Boxes(bytes, stsd.data + 8, stsd.end, b, 0, false)
  need(entries.length === count)
  for (const entry of entries) {
    fits(entry, entry.data, 8)
    const reference = bytes.readUInt16BE(entry.data + 6)
    need(reference > 0 && reference <= references)
    if (!video) continue
    need(length(entry) >= 78)
    need(bytes.readUInt16BE(entry.data + 24) > 0 && bytes.readUInt16BE(entry.data + 26) > 0)
    const configTypes = { avc1: 'avcC', avc3: 'avcC', hvc1: 'hvcC', hev1: 'hvcC', av01: 'av1C', vp08: 'vpcC', vp09: 'vpcC', mp4v: 'esds' }
    const configType = configTypes[entry.type]
    need(Boolean(configType))
    const configs = mp4Boxes(bytes, entry.data + 78, entry.end, b)
    const config = one(configs, configType)
    if (configType === 'avcC') avcConfig(bytes, config)
    else if (configType === 'hvcC') {
      need(length(config) >= 23 && bytes[config.data] === 1)
      let p = config.data + 23
      for (let i = 0; i < bytes[config.data + 22]; i++) {
        fits(config, p, 3); const countNAL = bytes.readUInt16BE(p + 1); p += 3
        step(b, countNAL)
        for (let j = 0; j < countNAL; j++) {
          fits(config, p, 2); const size = bytes.readUInt16BE(p); p += 2
          need(size > 0); fits(config, p, size); p += size
        }
      }
      need(p === config.end)
    } else if (configType === 'av1C') need(length(config) >= 4 && bytes[config.data] === 0x81)
    else if (configType === 'vpcC') { full(bytes, config, [0, 1]); need(length(config) >= 12) }
    else { full(bytes, config); need(length(config) > 4) }
  }
  return count
}
function mp4Track(bytes, track, ranges, b) {
  const tkhd = one(track.children, 'tkhd'), tk = full(bytes, tkhd, [0, 1])
  need(length(tkhd) >= (tk.version ? 96 : 84))
  const id = u32(bytes, tkhd, tkhd.data + (tk.version ? 20 : 12)); need(id > 0)
  const mdia = one(track.children, 'mdia'), mdhd = one(mdia.children, 'mdhd')
  const md = full(bytes, mdhd, [0, 1]); need(length(mdhd) >= (md.version ? 36 : 24))
  need(u32(bytes, mdhd, mdhd.data + (md.version ? 20 : 12)) > 0)
  const hdlr = one(mdia.children, 'hdlr'); full(bytes, hdlr); need(length(hdlr) >= 24)
  const handler = bytes.toString('ascii', hdlr.data + 8, hdlr.data + 12), video = handler === 'vide'
  const minf = one(mdia.children, 'minf')
  if (video) { const vmhd = one(minf.children, 'vmhd'); full(bytes, vmhd); need(length(vmhd) === 12) }
  const dinf = one(minf.children, 'dinf'), dref = one(dinf.children, 'dref'); full(bytes, dref)
  const refs = mp4Boxes(bytes, dref.data + 8, dref.end, b, 0, false)
  need(refs.length === u32(bytes, dref, dref.data + 4) && refs.length > 0 && refs.length <= 64)
  for (const ref of refs) need(ref.type === 'url ' && full(bytes, ref).flags === 1 && length(ref) === 4)
  const stbl = one(minf.children, 'stbl'), children = stbl.children
  const descriptionCount = descriptions(bytes, one(children, 'stsd'), video, refs.length, b)
  const stsz = one(children, 'stsz', false), stz2 = one(children, 'stz2', false)
  need(Boolean(stsz) !== Boolean(stz2))
  const sizes = stsz || stz2; full(bytes, sizes)
  const sampleCount = u32(bytes, sizes, sizes.data + 8); step(b, sampleCount)
  let sizeAt
  if (stsz) {
    const fixed = u32(bytes, stsz, stsz.data + 4)
    need(length(stsz) === 12 + (fixed ? 0 : 4 * sampleCount))
    sizeAt = index => fixed || bytes.readUInt32BE(stsz.data + 12 + index * 4)
  } else {
    const bits = bytes[stz2.data + 7]; need([4, 8, 16].includes(bits))
    need(length(stz2) === 12 + Math.ceil(sampleCount * bits / 8))
    sizeAt = index => bits === 4 ? (bytes[stz2.data + 12 + (index >> 1)] >> (index % 2 ? 0 : 4)) & 15 : bits === 8 ? bytes[stz2.data + 12 + index] : bytes.readUInt16BE(stz2.data + 12 + index * 2)
  }
  const stts = one(children, 'stts'), timingCount = table(bytes, stts, 8, b)
  let timedSamples = 0
  for (let i = 0; i < timingCount; i++) {
    const n = bytes.readUInt32BE(stts.data + 8 + 8 * i), delta = bytes.readUInt32BE(stts.data + 12 + 8 * i)
    need(n > 0 && delta > 0); timedSamples += n
  }
  need(timedSamples === sampleCount)
  const ctts = one(children, 'ctts', false)
  if (ctts) {
    full(bytes, ctts, [0, 1]); const n = u32(bytes, ctts, ctts.data + 4); step(b, n)
    need(length(ctts) === 8 + n * 8)
    let sum = 0
    for (let i = 0; i < n; i++) { const count = bytes.readUInt32BE(ctts.data + 8 + i * 8); need(count > 0); sum += count }
    need(sum === sampleCount)
  }
  const stss = one(children, 'stss', false)
  if (stss) {
    const n = table(bytes, stss, 4, b); let previous = 0
    for (let i = 0; i < n; i++) { const sample = bytes.readUInt32BE(stss.data + 8 + i * 4); need(sample > previous && sample <= sampleCount); previous = sample }
  }
  const stco = one(children, 'stco', false), co64 = one(children, 'co64', false)
  need(Boolean(stco) !== Boolean(co64))
  const offsets = stco || co64, stride = stco ? 4 : 8, chunkCount = table(bytes, offsets, stride, b)
  const stsc = one(children, 'stsc'), runs = table(bytes, stsc, 12, b)
  need((sampleCount === 0 && chunkCount === 0 && runs === 0) || (sampleCount > 0 && chunkCount > 0 && runs > 0))
  let previous = 0
  for (let i = 0; i < runs; i++) {
    const p = stsc.data + 8 + i * 12, first = bytes.readUInt32BE(p)
    need(first > previous && first <= chunkCount && (i > 0 || first === 1))
    need(bytes.readUInt32BE(p + 4) > 0 && bytes.readUInt32BE(p + 8) > 0 && bytes.readUInt32BE(p + 8) <= descriptionCount)
    previous = first
  }
  let sample = 0, run = 0
  for (let chunk = 1; chunk <= chunkCount; chunk++) {
    step(b)
    if (run + 1 < runs && bytes.readUInt32BE(stsc.data + 8 + (run + 1) * 12) === chunk) run++
    const n = bytes.readUInt32BE(stsc.data + 12 + run * 12)
    need(n <= sampleCount - sample)
    let chunkBytes = 0
    for (let i = 0; i < n; i++) { step(b); const size = sizeAt(sample++); need(size > 0); chunkBytes += size }
    const p = offsets.data + 8 + (chunk - 1) * stride
    inMedia(ranges, stco ? bytes.readUInt32BE(p) : u64(bytes, offsets, p), chunkBytes)
  }
  need(sample === sampleCount)
  return { id, video, sampleCount, descriptionCount }
}
function mp4Fragments(bytes, roots, tracks, defaults, ranges, b) {
  let videoSamples = 0
  for (const moof of roots.filter(node => node.type === 'moof')) {
    const mfhd = one(moof.children, 'mfhd'); full(bytes, mfhd); need(length(mfhd) === 8)
    const trafs = moof.children.filter(node => node.type === 'traf'); need(trafs.length > 0 && trafs.length <= 64)
    let precedingEnd = moof.start
    for (const traf of trafs) {
      const tfhd = one(traf.children, 'tfhd'), { flags } = full(bytes, tfhd)
      need((flags & ~0x03003b) === 0 && !((flags & 1) && (flags & 0x020000)))
      const id = u32(bytes, tfhd, tfhd.data + 4), track = tracks.get(id), fallback = defaults.get(id)
      need(track && fallback)
      let p = tfhd.data + 8, base = (flags & 0x020000) ? moof.start : precedingEnd
      const take = () => { const value = u32(bytes, tfhd, p); p += 4; return value }
      if (flags & 1) { base = u64(bytes, tfhd, p); p += 8 }
      const description = flags & 2 ? take() : fallback.description
      const duration = flags & 8 ? take() : fallback.duration
      const size = flags & 16 ? take() : fallback.size
      if (flags & 32) take()
      need(p === tfhd.end && description > 0 && description <= track.descriptionCount)
      const tfdt = one(traf.children, 'tfdt'), dt = full(bytes, tfdt, [0, 1])
      need(length(tfdt) === (dt.version ? 12 : 8))
      if (dt.version) u64(bytes, tfdt, tfdt.data + 4)
      const runs = traf.children.filter(node => node.type === 'trun')
      need(runs.length > 0)
      let cursor = base, totalSamples = 0
      for (const trun of runs) {
        const { flags: runFlags } = full(bytes, trun, [0, 1]); need((runFlags & ~0x000f05) === 0 && !((runFlags & 4) && (runFlags & 0x400)))
        const count = u32(bytes, trun, trun.data + 4); step(b, count); p = trun.data + 8
        if (runFlags & 1) { fits(trun, p, 4); cursor = base + bytes.readInt32BE(p); p += 4 }
        if (runFlags & 4) { fits(trun, p, 4); p += 4 }
        let runBytes = 0
        for (let i = 0; i < count; i++) {
          const sampleDuration = runFlags & 0x100 ? u32(bytes, trun, p) : duration
          if (runFlags & 0x100) p += 4
          const sampleSize = runFlags & 0x200 ? u32(bytes, trun, p) : size
          if (runFlags & 0x200) p += 4
          if (runFlags & 0x400) { fits(trun, p, 4); p += 4 }
          if (runFlags & 0x800) { fits(trun, p, 4); p += 4 }
          need(sampleSize > 0 && sampleDuration > 0); runBytes += sampleSize
        }
        need(p === trun.end)
        if (count) { inMedia(ranges, cursor, runBytes); cursor += runBytes }
        totalSamples += count
      }
      need(!(flags & 0x010000) || totalSamples === 0)
      precedingEnd = cursor
      if (track.video) videoSamples += totalSamples
    }
  }
  return videoSamples
}
function mp4(bytes, b) {
  const roots = mp4Boxes(bytes, 0, bytes.length, b)
  const ftyp = one(roots, 'ftyp'); need(roots[0] === ftyp && length(ftyp) >= 8 && length(ftyp) % 4 === 0)
  let brand = false
  for (let p = ftyp.data; p < ftyp.end; p += 4) {
    step(b)
    if (p !== ftyp.data + 4 && /^(?:isom|iso[2-6]|mp4[12]|avc1|M4V )$/.test(bytes.toString('ascii', p, p + 4))) brand = true
  }
  need(brand)
  const moov = one(roots, 'moov'), mvhd = one(moov.children, 'mvhd'), mv = full(bytes, mvhd, [0, 1])
  need(length(mvhd) >= (mv.version ? 112 : 100) && u32(bytes, mvhd, mvhd.data + (mv.version ? 20 : 12)) > 0)
  const ranges = roots.filter(node => node.type === 'mdat'); need(ranges.length > 0)
  const tracks = new Map(), traks = moov.children.filter(node => node.type === 'trak')
  need(traks.length > 0 && traks.length <= 64)
  let videoSamples = 0
  for (const trak of traks) {
    const track = mp4Track(bytes, trak, ranges, b); need(!tracks.has(track.id)); tracks.set(track.id, track)
    if (track.video) videoSamples += track.sampleCount
  }
  const defaults = new Map(), mvex = one(moov.children, 'mvex', false)
  if (mvex) for (const trex of mvex.children.filter(node => node.type === 'trex')) {
    full(bytes, trex); need(length(trex) === 24)
    const id = u32(bytes, trex, trex.data + 4); need(tracks.has(id) && !defaults.has(id))
    const description = u32(bytes, trex, trex.data + 8)
    need(description > 0 && description <= tracks.get(id).descriptionCount)
    defaults.set(id, { description, duration: u32(bytes, trex, trex.data + 12), size: u32(bytes, trex, trex.data + 16) })
  }
  videoSamples += mp4Fragments(bytes, roots, tracks, defaults, ranges, b)
  need(videoSamples > 0)
}

// Only Segment and Cluster permit unknown size in the Matroska schema. A
// streaming Cluster ends at the next Segment-level sibling, not blindly at EOF.
const segmentChildren = new Set(['114d9b74', '1549a966', '1654ae6b', '1f43b675', '1c53bb6b', '1941a469', '1043a770', '1254c367'])
const ebmlMasters = new Set([
  '1a45dfa3', '18538067', ...segmentChildren, '4dbb', 'ae', 'e0', 'e1', 'a0',
  '75a1', 'a6', '8e', 'e8', 'c8', '41e4', '5034', '5035', '6d80', '6240',
  '55b0', '55d0', '7670', 'bb', 'b7', 'db', '61a7', '45b9', 'b6', '80',
  '6944', '6911', '7373', '63c0', '67c8', '6624',
])
function vint(bytes, p, end, id = false) {
  need(p < end && bytes[p] !== 0)
  let n = 1
  while (n <= 8 && !(bytes[p] & (0x80 >> (n - 1)))) n++
  need(n <= (id ? 4 : 8) && p + n <= end)
  let value = BigInt(bytes[p] & ((0x80 >> (n - 1)) - 1))
  for (let i = 1; i < n; i++) value = (value << 8n) | BigInt(bytes[p + i])
  return { n, value, unknown: value === (1n << BigInt(n * 7)) - 1n }
}
function ebmlElement(bytes, start, end, b) {
  step(b); need(--b.nodes >= 0)
  const id = vint(bytes, start, end, true), p = start + id.n, size = vint(bytes, p, end)
  need(!id.unknown && id.value !== 0n)
  const data = p + size.n
  need(size.unknown || size.value <= BigInt(end - data))
  return { type: bytes.subarray(start, p).toString('hex'), start, data, end: size.unknown ? end : data + Number(size.value), unknown: size.unknown }
}
function ebmlChildren(bytes, start, end, b, depth = 0, unknownCluster = false) {
  need(depth <= MAX_DEPTH)
  const children = []
  let p = start
  while (p < end) {
    const node = ebmlElement(bytes, p, end, b)
    if (unknownCluster && segmentChildren.has(node.type)) break
    need(!node.unknown || node.type === '18538067' || node.type === '1f43b675')
    if (ebmlMasters.has(node.type)) {
      const result = ebmlChildren(bytes, node.data, node.end, b, depth + 1, node.unknown && node.type === '1f43b675')
      node.children = result.children; node.end = result.end
    }
    need(node.end >= node.data && node.end > p)
    children.push(node); p = node.end
  }
  return { children, end: p }
}
function uint(bytes, node, wide = false) {
  need(length(node) <= 8)
  let value = 0n
  for (let p = node.data; p < node.end; p++) value = (value << 8n) | BigInt(bytes[p])
  if (wide) return value
  need(value <= BigInt(Number.MAX_SAFE_INTEGER))
  return Number(value)
}
function text(bytes, node) {
  need(length(node) > 0 && length(node) <= 4096)
  const value = bytes.toString('utf8', node.data, node.end)
  need(!value.includes('\ufffd') && !value.includes('\0'))
  return value
}
function floating(bytes, node) {
  need(length(node) === 4 || length(node) === 8)
  const value = length(node) === 4 ? bytes.readFloatBE(node.data) : bytes.readDoubleBE(node.data)
  need(Number.isFinite(value) && value > 0)
  return value
}
function webmBlock(bytes, node, tracks, b, simple) {
  const trackVint = vint(bytes, node.data, node.end)
  need(trackVint.value > 0 && trackVint.value <= BigInt(Number.MAX_SAFE_INTEGER))
  const track = tracks.get(Number(trackVint.value)); need(track)
  let p = node.data + trackVint.n
  fits(node, p, 3); const flags = bytes[p + 2]; p += 3
  need((flags & (simple ? 0x70 : 0xf1)) === 0)
  const lace = (flags >> 1) & 3
  if (!lace) need(p < node.end)
  else {
    fits(node, p, 1); const frames = bytes[p++] + 1; need(frames >= 2); step(b, frames)
    if (lace === 2) need(node.end > p && (node.end - p) % frames === 0)
    else {
      let sum = 0, previous = 0
      for (let i = 0; i < frames - 1; i++) {
        let size = 0
        if (lace === 1) {
          let part
          do { step(b); fits(node, p, 1); part = bytes[p++]; size += part } while (part === 255)
        } else {
          const value = vint(bytes, p, node.end); p += value.n
          const signed = i ? value.value - ((1n << BigInt(7 * value.n - 1)) - 1n) : value.value
          need(signed >= BigInt(-MAX_BYTES) && signed <= BigInt(MAX_BYTES))
          size = i ? previous + Number(signed) : Number(signed)
        }
        need(size > 0 && size <= MAX_BYTES); sum += size; previous = size
      }
      need(sum < node.end - p)
    }
  }
  return track.video
}
function webm(bytes, b) {
  const root = ebmlChildren(bytes, 0, bytes.length, b).children
  const header = one(root, '1a45dfa3'), segment = one(root, '18538067')
  need(root[0] === header && !header.unknown && segment.end === bytes.length)
  need(text(bytes, one(header.children, '4282')) === 'webm')
  for (const [id, max] of [['42f7', 1], ['42f2', 4], ['42f3', 8], ['4285', 4]]) {
    const field = one(header.children, id, false)
    if (field) { const value = uint(bytes, field); need(value > 0 && value <= max) }
  }
  const info = one(segment.children, '1549a966'), trackMaster = one(segment.children, '1654ae6b')
  const scale = one(info.children, '2ad7b1', false); if (scale) need(uint(bytes, scale) > 0)
  text(bytes, one(info.children, '4d80')); text(bytes, one(info.children, '5741'))
  const duration = one(info.children, '4489', false); if (duration) floating(bytes, duration)
  const tracks = new Map(), entries = trackMaster.children.filter(node => node.type === 'ae')
  need(entries.length > 0 && entries.length <= 64)
  for (const entry of entries) {
    const number = uint(bytes, one(entry.children, 'd7')), uid = uint(bytes, one(entry.children, '73c5'), true)
    const type = uint(bytes, one(entry.children, '83')), codec = text(bytes, one(entry.children, '86'))
    need(number > 0 && uid > 0 && !tracks.has(number) && (type === 1 || type === 2))
    const video = type === 1
    if (video) {
      need(/^V_(?:VP8|VP9|AV1)$/.test(codec))
      const dimensions = one(entry.children, 'e0')
      for (const id of ['b0', 'ba']) { const n = uint(bytes, one(dimensions.children, id)); need(n > 0 && n <= 65535) }
      const privateData = one(entry.children, '63a2', false)
      if (codec === 'V_AV1') need(privateData && length(privateData) >= 4 && bytes[privateData.data] === 0x81)
    } else {
      need(/^A_(?:VORBIS|OPUS)$/.test(codec))
      const audio = one(entry.children, 'e1'), frequency = one(audio.children, 'b5', false)
      if (frequency) floating(bytes, frequency)
      const channels = one(audio.children, '9f', false); if (channels) need(uint(bytes, channels) > 0)
    }
    tracks.set(number, { video })
  }
  const clusters = segment.children.filter(node => node.type === '1f43b675'); need(clusters.length > 0)
  let videoBlocks = 0
  for (const cluster of clusters) {
    uint(bytes, one(cluster.children, 'e7'))
    let blocks = 0
    for (const child of cluster.children) {
      step(b)
      if (child.type === 'a3') { if (webmBlock(bytes, child, tracks, b, true)) videoBlocks++; blocks++ }
      if (child.type === 'a0') {
        const block = one(child.children, 'a1')
        if (webmBlock(bytes, block, tracks, b, false)) videoBlocks++
        blocks++
        const blockDuration = one(child.children, '9b', false); if (blockDuration) need(uint(bytes, blockDuration) > 0)
      }
    }
    need(blocks > 0)
  }
  need(videoBlocks > 0)
}

export function isMp4(bytes) {
  try { need(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= MAX_BYTES); mp4(bytes, budget()); return true } catch { return false }
}
export function isWebm(bytes) {
  try { need(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= MAX_BYTES); webm(bytes, budget()); return true } catch { return false }
}
