import Clients from '@models/Clients'
import Events from '@models/Events'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { countTypeUsage } from '@server/typeUsage'

export const GET = async (req) => {
  const { tenantId } = await getRequestContext(req)
  if (!tenantId) return Response.json({ error: 'Не авторизован' }, { status: 401 })
  await dbConnect()
  const [clients, events] = await Promise.all([
    countTypeUsage(Clients, tenantId, 'clientType', 'none'),
    countTypeUsage(Events, tenantId, 'eventType'),
  ])
  return Response.json({ clients, events }, { headers: { 'Cache-Control': 'no-store' } })
}
