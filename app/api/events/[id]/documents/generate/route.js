import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { generateWebDocument } from '@server/webDocumentGeneration'
import { EntityDocumentError } from '@server/entityDocumentFiles'

export const runtime = 'nodejs'
export const POST = async (req, { params }) => {
  try {
    const { tenantId, user } = await getTenantContext()
    if (!tenantId || !user?._id)
      return NextResponse.json(
        { success: false, error: 'Не авторизован' },
        { status: 401 }
      )
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const access = await getUserTariffAccess(user._id)
    await dbConnect()
    const data = await generateWebDocument({
      eventId: id,
      tenantId,
      user,
      access,
      body,
    })
    return NextResponse.json(
      { success: true, data },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof EntityDocumentError
            ? error.message
            : 'Не удалось создать документ. Повторите попытку.',
        code: error.code || 'GENERATION_FAILED',
      },
      { status: error.status || 500 }
    )
  }
}
