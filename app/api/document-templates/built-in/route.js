import { NextResponse } from 'next/server'
import { BUILT_IN_CONTRACT_TEMPLATES } from '@helpers/builtInContractTemplates.mjs'
import getRequestContext from '@server/getRequestContext'

export const runtime = 'nodejs'

export const GET = async (request) => {
  const { user, tenantId } = await getRequestContext(request)
  if (!user?._id || !tenantId)
    return NextResponse.json({ success: false, error: 'Не авторизован' }, { status: 401 })

  return NextResponse.json({ success: true, data: BUILT_IN_CONTRACT_TEMPLATES })
}
