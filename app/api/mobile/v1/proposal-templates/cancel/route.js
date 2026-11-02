import { POST as createTemplate } from '../../../../proposal-templates/route'
import { requireCreationRequest } from '@server/idempotentResourceCreation'

export const POST = requireCreationRequest(req =>
  createTemplate(req, { creationIntent: 'cancel' })
)
