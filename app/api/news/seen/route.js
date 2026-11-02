import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { markUserNewsSeen, newsReaderScope } from '@server/newsReader'

export const POST = async (req) => {
  try {
    const context = await getRequestContext(req)
    newsReaderScope(context)
    await dbConnect()
    const body = await req.json().catch(() => null)
    return NextResponse.json(
      { success: true, data: await markUserNewsSeen(context, body) },
      { status: 200 }
    )
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.status ? error.message : 'Не удалось сохранить отметку прочтения' },
      { status: error.status || 500 }
    )
  }
}
