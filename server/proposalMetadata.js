import crypto from 'node:crypto'
import Proposals from '@models/Proposals'
import dbConnect from '@server/dbConnect'
import { normalizeProposalAppearance } from '@helpers/proposalAppearance.mjs'
import { BRAND } from '@helpers/brand.mjs'

export const buildProposalMetadata = (proposal = null) => {
  const name = typeof proposal?.artistSnapshot?.fullName === 'string'
    ? proposal.artistSnapshot.fullName.replace(/\s+/g, ' ').trim().slice(0, 160)
    : ''
  const title = name
    ? `Персональное предложение от ${name}`
    : 'Персональное предложение'
  const description = 'Откройте ссылку, чтобы посмотреть подготовленное для вас предложение и его условия.'
  const logo = proposal?.tenantId
    ? normalizeProposalAppearance(proposal.appearance, proposal.tenantId).logoUrl
    : ''
  // Explicit images override the inherited marketing OG/Twitter artwork.
  const image = logo || `${BRAND.primaryUrl}/icons/vedelo-v1/android/android-launchericon-512-512.png`
  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: false, nocache: true },
    referrer: 'no-referrer',
    openGraph: {
      type: 'website', locale: 'ru_RU', siteName: name || BRAND.name,
      title, description, images: [{ url: image, alt: name || title }],
    },
    twitter: { card: 'summary', title, description, images: [image] },
  }
}

export const getProposalMetadata = async (publicId, token) => {
  if (typeof publicId !== 'string' || !/^[\w-]{22}$/.test(publicId) ||
      typeof token !== 'string' || !/^[\w-]{43}$/.test(token))
    return buildProposalMetadata()
  try {
    await dbConnect()
    // The secret URL is the public capability, as in the public proposal API.
    // Match its hash before reading any tenant data; do not call GET (it counts views).
    const proposal = await Proposals.findOne({
      publicId,
      publicTokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      tenantId: { $ne: null },
      status: 'published',
      $or: [{ validUntil: null }, { validUntil: { $gte: new Date() } }],
    }).select('tenantId artistSnapshot.fullName appearance').lean()
    return buildProposalMetadata(proposal)
  } catch {
    return buildProposalMetadata()
  }
}
