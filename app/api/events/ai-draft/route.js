import { NextResponse } from 'next/server'
import getRequestContext from '@server/getRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { processEventAiDraft } from '@server/eventAiDraft'

// Общий текстовый контракт сохраняется для Web/PWA и mobile voice/text.
export async function POST(request) {
  try {
    const { tenantId, user } = await getRequestContext(request)
    if (!tenantId) return NextResponse.json({ error: 'Неавторизованный доступ', fields: null }, { status: 401 })
    const access = await getUserTariffAccess(user?._id)
    if (!access?.allowAi) return NextResponse.json({ success: false, error: 'AI-черновик доступен только в тарифе с ИИ' }, { status: 403 })
    const body = await request.json()
    const text = (body?.text ?? '').trim()
    if (!text) return NextResponse.json({ error: 'Пустой текст', fields: {} }, { status: 400 })
    if (text.length > 12000) return NextResponse.json({ error: 'Текст слишком длинный. Максимум 12000 символов', fields: {} }, { status: 413 })
    return await processEventAiDraft({ text, tenantId, userId: user?._id })
  } catch {
    return NextResponse.json({ error: 'Внутренняя ошибка сервера', fields: null }, { status: 500 })
  }
}
