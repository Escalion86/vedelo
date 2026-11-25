import { isObjectIdOrHexString } from 'mongoose'
import { NextResponse } from 'next/server'
import Clients from '@models/Clients'
import Events from '@models/Events'
import Transactions from '@models/Transactions'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'

export const GET = async (req, { params }) => {
  const { tenantId } = await getRequestContext(req)
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const { id } = await params
  if (!isObjectIdOrHexString(id)) {
    return NextResponse.json(
      { success: false, error: 'Клиент не найден' },
      { status: 404 }
    )
  }

  await dbConnect()
  if (!(await Clients.exists({ _id: id, tenantId }))) {
    return NextResponse.json(
      { success: false, error: 'Клиент не найден' },
      { status: 404 }
    )
  }

  const events = await Events.find({
    tenantId,
    $or: [{ clientId: id }, { 'otherContacts.clientId': id }],
  })
    .sort({ eventDate: -1, createdAt: -1 })
    .lean()

  const transactions = await Transactions.find({
    tenantId,
    $or: [
      { clientId: id },
      { eventId: { $in: events.map((event) => event._id) } },
    ],
  })
    .sort({ date: -1, createdAt: -1 })
    .lean()

  return NextResponse.json({ success: true, data: { events, transactions } })
}
