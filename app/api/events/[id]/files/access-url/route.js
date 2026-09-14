import { handleEntityDocumentAccess } from '@server/entityDocumentRouteHandlers'

export const runtime = 'nodejs'

export const POST = (req, { params }) =>
  handleEntityDocumentAccess(req, params, 'events')
