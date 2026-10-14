// Синтетический HTTP transport. API/schema/identity/ledger исполняются из mobile.
import { proposalsApi as responses } from './native.fixture-api'

let savedTemplate: unknown
export const api = {
  request: async (path: string, options?: { method?: string; body?: any }) => {
    const method = options?.method || 'GET'
    let data: unknown
    if (path === '/proposal-templates/t' && method === 'PATCH') {
      data = await responses.saveTemplate('t', options?.body)
      savedTemplate = structuredClone(data)
    } else if (path === '/proposal-templates/t/preview' && method === 'POST') {
      data = await responses.previewTemplate('t', options?.body)
    } else if (method === 'GET' && path === '/proposal-templates/t') {
      data = savedTemplate || await responses.template()
    } else if (method === 'GET' && path === '/proposal-templates/defaults') {
      data = await responses.templateDefaults()
    } else if (method === 'GET' && path === '/proposal-templates') {
      data = await responses.templates()
    } else if (method === 'GET' && path === '/services') {
      data = await responses.services()
    } else if (method === 'GET' && path === '/events/e/proposals') {
      data = await responses.list()
    } else if (method === 'GET' && path === '/mobile/v1/events/e') {
      data = await responses.readEvent()
    } else if (method === 'GET' && path === '/proposals/p') {
      data = await responses.get()
    } else {
      throw Error('Неожиданный synthetic transport: ' + method + ' ' + path)
    }
    return { success: true, data: structuredClone(data) }
  },
}
