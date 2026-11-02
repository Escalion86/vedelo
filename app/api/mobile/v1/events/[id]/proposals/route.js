import { POST as createProposal } from '../../../../../events/[id]/proposals/route'
import { requireCreationRequest } from '@server/idempotentResourceCreation'

export const POST = requireCreationRequest(createProposal)
