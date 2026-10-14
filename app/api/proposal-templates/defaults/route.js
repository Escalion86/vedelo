import { NextResponse } from 'next/server'
import getProposalRequestContext from '@server/proposalRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import {
  canUseProposalBuilder,
  PROPOSAL_BUILDER_ACCESS_ERROR,
} from '@helpers/proposalAccess'
import {
  normalizeProposalBlocks,
  materializeProposalTemplateDefaults,
  DEFAULT_PROPOSAL_MESSAGE,
} from '@helpers/proposalContent'
export async function GET(req) {
  const { tenantId, user } = await getProposalRequestContext(req)
  if (!tenantId || !user?._id)
    return NextResponse.json(
      {
        success: false,
        error: { code: 'unauthorized', message: 'Не авторизован' },
      },
      { status: 401 }
    )
  if (!canUseProposalBuilder(await getUserTariffAccess(user._id)))
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'proposal_tariff_required',
          message: PROPOSAL_BUILDER_ACCESS_ERROR,
        },
      },
      { status: 403 }
    )
  return NextResponse.json({
    success: true,
    data: {
      blocks: normalizeProposalBlocks(),
      media: [],
      defaults: materializeProposalTemplateDefaults({}),
      messageTemplate: DEFAULT_PROPOSAL_MESSAGE,
    },
  })
}
