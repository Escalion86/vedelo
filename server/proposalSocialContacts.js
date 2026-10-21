import Users from '@models/Users'
import { PROPOSAL_CONTACT_FIELDS, pickProposalArtistContacts } from '@helpers/proposalArtistContacts.mjs'

// Social links are current profile information, separate from the agreed snapshot.
export async function getProposalSocialContacts(proposal) {
  const tenantId = proposal.tenantId
  if (!tenantId) return {}
  const fields = PROPOSAL_CONTACT_FIELDS.filter(key => key !== 'phone')
  const profile = await Users.findOne({
    _id: tenantId,
    $or: [{ tenantId }, { tenantId: null }],
    archive: { $ne: true },
  }).select(`_id tenantId archive ${fields.join(' ')}`).lean()
  if (!profile || profile.archive || String(profile._id) !== String(tenantId) ||
      String(profile.tenantId || profile._id) !== String(tenantId)) return {}
  const contacts = pickProposalArtistContacts(profile)
  return Object.fromEntries(fields.map(key => [key, contacts[key]]))
}
