import { PROPOSAL_CONTACT_FIELDS } from '@helpers/proposalArtistContacts.mjs'
import getRequestContext from '@server/getRequestContext'

// A supplied but malformed Authorization must never become a cookie request.
// Keep this guard local to the proposal workflow; shared auth is unchanged.
export default async function getProposalRequestContext(req) {
  const authorization = req?.headers?.get?.('authorization')
  if (authorization != null && !/^Bearer [^\s,]+$/.test(authorization))
    return {
      user: null,
      tenantId: null,
      authType: 'mobile',
      error: 'Не авторизован',
    }
  return getRequestContext(req)
}

// Private workflow only: auth DTO stays minimal. Copy allowed profile fields
// from the tariff lookup after proving that it is the authenticated account.
export function getProposalArtistProfile(context, access) {
  const profile = access?.user
  if (
    !profile?._id ||
    profile.archive ||
    String(profile._id) !== String(context.user?._id) ||
    String(profile.tenantId || profile._id) !== String(context.tenantId)
  ) return null
  return Object.fromEntries(
    ['firstName', 'secondName', 'thirdName', ...PROPOSAL_CONTACT_FIELDS].map((key) => [
      key, ['string', 'number'].includes(typeof profile[key]) ? String(profile[key]) : '',
    ])
  )
}
