import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import { sendLegacyMigrationNoticeAndDeactivate } from '@server/pushNotifications'
import { canRunPushReminderCron } from '../reminders/cronAccess'

const canRun = async (req) => {
  if (canRunPushReminderCron(req).ok) return true

  const { user } = await getTenantContext()
  return Boolean(user && ['dev', 'admin'].includes(user.role))
}

const handleRequest = async (req) => {
  if (!(await canRun(req))) {
    return NextResponse.json(
      { success: false, error: 'Нет доступа' },
      { status: 403 }
    )
  }

  await dbConnect()
  const data = await sendLegacyMigrationNoticeAndDeactivate()

  return NextResponse.json({ success: data.ok, data }, { status: data.ok ? 200 : 503 })
}

export const GET = handleRequest
export const POST = handleRequest
