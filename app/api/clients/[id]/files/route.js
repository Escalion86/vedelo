import {
  handleEntityDocumentDelete,
  handleEntityDocumentUpload,
} from '@server/entityDocumentRouteHandlers'

export const runtime = 'nodejs'

export const POST = (req, { params }) =>
  handleEntityDocumentUpload(req, params, 'clients')

export const DELETE = (req, { params }) =>
  handleEntityDocumentDelete(req, params, 'clients')
