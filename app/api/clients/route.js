import { NextResponse } from 'next/server'
import Clients from '@models/Clients'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { recordActivityHistory } from '@server/activityHistory'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { createClientOnce } from '@server/clientCreation'
import {
  entityHasDocuments,
  normalizeEntityDocuments,
} from '@helpers/entityDocuments'

export const GET = async (req) => {
  const context = await getRequestContext(req)
  const { tenantId } = context
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  await dbConnect()
  const clients = await Clients.find({ tenantId }).sort({ firstName: 1 }).lean()
  return NextResponse.json({ success: true, data: clients }, { status: 200 })
}

export const POST = async (req) => {
  const body = await req.json()
  const context = await getRequestContext(req)
  const { tenantId } = context
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  const documents = normalizeEntityDocuments(body.documents)
  const access = await getUserTariffAccess(context.user?._id)
  if (entityHasDocuments({ documents }) && !access?.allowDocuments) {
    return NextResponse.json(
      { success: false, error: 'Файлы и документы недоступны на текущем тарифе' },
      { status: 403 }
    )
  }
  await dbConnect()
  const result = await createClientOnce({
    Clients,
    tenantId,
    body,
    documents,
    key: req.headers.get('Idempotency-Key') || '',
  })
  if (result.error) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status }
    )
  }
  const client = result.data

  if (result.created) await recordActivityHistory({
    req,
    context,
    entityType: 'client',
    entityId: client._id,
    operation: 'create',
    after: client,
  })

  return NextResponse.json({ success: true, data: client }, { status: 201 })
}
