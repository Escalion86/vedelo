import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { isMp4, isWebm } from './videoContainerValidation'

const MiB = 1024 * 1024
const images = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const videos = new Set(['video/mp4', 'video/webm'])
const imageTypes = {
  jpeg: ['jpg', 'image/jpeg'], png: ['png', 'image/png'],
  webp: ['webp', 'image/webp'], gif: ['gif', 'image/gif'],
}

// Validate the entire batch before any upstream call. Images are decoded and
// re-encoded without metadata; original filenames never become public media.
export async function validateUploadFiles(files, { generic = false, imageOnly = false } = {}) {
  if (!Array.isArray(files) || !files.length || (generic && files.length !== 1)) return null
  const result = []
  for (const file of files) {
    if (!(file instanceof File) || !file.size) return null
    const image = images.has(file.type), video = videos.has(file.type)
    const limit = generic ? 5 : video && !imageOnly ? 50 : 10
    if (file.size > limit * MiB || (imageOnly && !image) || (!generic && !image && !video)) return null
    const bytes = Buffer.from(await file.arrayBuffer())
    let output = bytes, extension, type = file.type
    if (image) {
      try {
        const decoder = sharp(bytes, { animated: true, limitInputPixels: 40000000, failOn: 'warning' })
        const metadata = await decoder.metadata()
        if (!imageTypes[metadata.format] || metadata.width * metadata.height > 40000000) return null
        const verified = imageTypes[metadata.format]
        extension = verified[0]
        type = verified[1]
        output = await decoder.rotate().toFormat(metadata.format).toBuffer()
        if (output.length > limit * MiB) return null
      } catch { return null }
    } else if (video) {
      if (imageOnly) return null
      extension = file.type === 'video/mp4' ? 'mp4' : 'webm'
      if (!(extension === 'mp4' ? isMp4(bytes) : isWebm(bytes))) return null
    } else {
      // Preserve the existing generic mobile document contract (one file <=5 MiB).
      // A claimed image/video outside the supported formats is still rejected.
      if (/^(?:image|video)\//.test(type)) return null
      extension = String(file.name).split('.').pop().toLowerCase()
      if (!/^[a-z0-9]{1,12}$/.test(extension)) extension = 'bin'
    }
    result.push(new File([output], `${randomUUID()}.${extension}`, { type }))
  }
  return result
}
