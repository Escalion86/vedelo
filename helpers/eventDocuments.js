import { mergeLegacyEventDocuments } from './entityDocuments.js'

// Старые клиенты ещё присылают documentFiles и отдельные массивы ссылок.
export const eventHasDocuments = (payload) =>
  mergeLegacyEventDocuments(payload).length > 0

export {
  mergeLegacyEventDocuments,
  normalizeDocumentFile,
  normalizeEntityDocument as normalizeEventDocument,
  normalizeEntityDocuments as normalizeEventDocuments,
} from './entityDocuments.js'
