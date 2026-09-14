import { NextResponse } from 'next/server'
import Clients from '@models/Clients'
import Events from '@models/Events'
import Transactions from '@models/Transactions'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { buildTenantSafeUpdate } from '@server/tenantSafeUpdate'
import { resetClientMessengerAvailability } from '@helpers/clientMessengerAvailability'
import { recordActivityHistory } from '@server/activityHistory'
import getUserTariffAccess from '@server/getUserTariffAccess'
import {
  entityHasDocuments,
  getDocumentStorageKeys,
  normalizeEntityDocuments,
} from '@helpers/entityDocuments'
import {
  recordSyncTombstone,
  withSyncVersionIncrement,
} from '@server/mobile/sync'

export const GET = async (req, { params }) => {
  const { id } = await params
  const context = await getRequestContext(req)
  const { tenantId } = context
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  await dbConnect()
  const client = await Clients.findOne({ _id: id, tenantId }).lean()
  if (!client)
    return NextResponse.json(
      { success: false, error: 'Клиент не найден' },
      { status: 404 }
    )
  return NextResponse.json({ success: true, data: client }, { status: 200 })
}

export const PUT = async (req, { params }) => {
  const { id } = await params
  const body = await req.json()
  const context = await getRequestContext(req)
  const { tenantId } = context
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  await dbConnect()

  const existingClient = await Clients.findOne({ _id: id, tenantId }).lean()
  if (!existingClient)
    return NextResponse.json(
      { success: false, error: 'Клиент не найден' },
      { status: 404 }
    )

  const update = resetClientMessengerAvailability(existingClient, body)
  if (body.documents !== undefined) {
    const documents = normalizeEntityDocuments(body.documents, {
      allowedStorageKeys: getDocumentStorageKeys(existingClient.documents),
    })
    const access = await getUserTariffAccess(context.user?._id)
    if (entityHasDocuments({ documents }) && !access?.allowDocuments) {
      return NextResponse.json(
        { success: false, error: 'Файлы и документы недоступны на текущем тарифе' },
        { status: 403 }
      )
    }
    update.documents = documents
  }

  const client = await Clients.findOneAndUpdate(
    { _id: id, tenantId },
    withSyncVersionIncrement(buildTenantSafeUpdate(update)),
    {
      returnDocument: 'after',
      runValidators: true,
    }
  )
  if (!client)
    return NextResponse.json(
      { success: false, error: 'Клиент не найден' },
      { status: 404 }
    )

  await recordActivityHistory({
    req,
    context,
    entityType: 'client',
    entityId: client._id,
    operation: 'update',
    before: existingClient,
    after: client.toJSON?.() ?? client,
  })

  return NextResponse.json({ success: true, data: client }, { status: 200 })
}

export const DELETE = async (req, { params }) => {
  const { id } = await params
  const context = await getRequestContext(req)
  const { tenantId } = context
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  await dbConnect()
  const eventsCount = await Events.countDocuments({ tenantId, clientId: id })
  if (eventsCount > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Нельзя удалить клиента: есть связанные мероприятия (${eventsCount})`,
      },
      { status: 409 }
    )
  }
  const transactionsCount = await Transactions.countDocuments({
    tenantId,
    clientId: id,
  })
  if (transactionsCount > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Нельзя удалить клиента: есть связанные транзакции (${transactionsCount})`,
      },
      { status: 409 }
    )
  }
  const deleted = await Clients.findOneAndDelete({ _id: id, tenantId })
  if (!deleted)
    return NextResponse.json(
      { success: false, error: 'Клиент не найден' },
      { status: 404 }
    )
  await recordActivityHistory({
    req,
    context,
    entityType: 'client',
    entityId: deleted._id,
    operation: 'delete',
    before: deleted.toJSON?.() ?? deleted,
  })
  await recordSyncTombstone({
    tenantId,
    entityType: 'clients',
    entityId: id,
    version: deleted.syncVersion,
  })
  return NextResponse.json(
    { success: true, data: { _id: String(id) } },
    { status: 200 }
  )
}
