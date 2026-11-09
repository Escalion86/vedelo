import { NextResponse } from 'next/server'
import getRequestContext from '@server/getRequestContext'
import {
  isDadataConfigured,
  selectAddress,
  suggestAddresses,
} from '@server/dadataSuggest.mjs'

export const POST = async (req) => {
  const { tenantId, user } = await getRequestContext(req)
  if (!tenantId || !user?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  if (!isDadataConfigured()) {
    return NextResponse.json(
      { success: true, data: { unavailable: true, suggestions: [] } },
      { status: 200 }
    )
  }

  const body = await req.json().catch(() => ({}))

  try {
    if (body?.mode === 'select') {
      const selected = await selectAddress({ query: body?.query })
      return NextResponse.json(
        { success: true, data: { unavailable: false, selected } },
        { status: 200 }
      )
    }

    const data = await suggestAddresses({ query: body?.query, town: body?.town })
    return NextResponse.json({ success: true, data }, { status: 200 })
  } catch (error) {
    // query не логируем (чувствительные данные), только факт ошибки
    console.error('DaData suggest failed:', Number(error?.status) || 'unavailable')
    return NextResponse.json(
      { success: false, error: 'Подсказки временно недоступны' },
      { status: 503 }
    )
  }
}
