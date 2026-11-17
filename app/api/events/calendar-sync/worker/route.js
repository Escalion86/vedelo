import { timingSafeEqual } from 'node:crypto'
import { after, NextResponse } from 'next/server'
import { runDueGoogleCalendarJobs } from '@server/googleCalendarSyncQueue'

export const runtime = 'nodejs'
export const maxDuration = 180

export const POST = async (request) => {
  const expected = Buffer.from(process.env.CRON_SECRET || '')
  const supplied = Buffer.from((request.headers.get('authorization') || '').replace(/^Bearer /, ''))
  if (!expected.length || supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) {
    return NextResponse.json({ success: false, error: 'Нет доступа' }, { status: 401 })
  }
  after(async () => {
    try {
      await runDueGoogleCalendarJobs()
    } catch {
      console.error('Could not run Google Calendar sync worker')
    }
  })
  return NextResponse.json({ success: true }, { status: 202 })
}
