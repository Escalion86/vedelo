import { NextResponse } from 'next/server'
import getRequestContext from '@server/getRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import dbConnect from '@server/dbConnect'
import { applyAiEdit, prepareAiEdit, searchAiEditEvents } from '@server/aiEdit'
import { getAiBalanceErrorMessage, isAiBalanceError } from '@server/aiBilling'
import { resolveAiEventIntent } from '@server/aiEventIntent'
import { processEventAiDraft } from '@server/eventAiDraft'
import { parseClipboardPhone, requestsClipboardPhone } from '@helpers/aiAssistantClipboard.mjs'

export async function POST(req) {
  try {
    const context = await getRequestContext(req)
    if (!context.tenantId || !context.user?._id) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    const access = await getUserTariffAccess(context.user._id)
    if (!access?.allowAi || (!access.hasTariff && !access.trialActive))
      return NextResponse.json({ error: 'Для помощника нужен действующий тариф с ИИ' }, { status: 403 })
    const raw = await req.text()
    if (raw.length > 16000) return NextResponse.json({ error: 'Запрос слишком длинный' }, { status: 413 })
    let body
    try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 }) }
    await dbConnect()
    if (body?.mode === 'apply') return NextResponse.json(await applyAiEdit({ planId: body.planId, context, req, access }))
    const text = typeof body?.text === 'string' ? body.text.trim() : ''
    if (!text || text.length > 12000) return NextResponse.json({ error: 'Введите запрос до 12000 символов' }, { status: 400 })
    const args = { tenantId: context.tenantId, userId: context.user._id, text, eventId: body.eventId }
    const clipboardPhone = body.clipboardPhone ? parseClipboardPhone(body.clipboardPhone) : ''
    if (body.clipboardPhone && !clipboardPhone)
      return NextResponse.json({ error: 'Укажите один корректный телефон из буфера обмена' }, { status: 400 })
    if (requestsClipboardPhone(text) && !clipboardPhone)
      return NextResponse.json({ needsClipboardPhone: true, question: 'Вставьте телефон клиента из буфера обмена и повторите запрос.' })
    if (clipboardPhone) {
      args.text += `\nТелефон клиента из буфера обмена: +${clipboardPhone}.`
      args.clientPhone = clipboardPhone
    }
    if (body.mode === 'auto' && !body.eventId) {
      const intent = await resolveAiEventIntent(args)
      if (intent.needsClipboardPhone && !clipboardPhone)
        return NextResponse.json({ needsClipboardPhone: true, question: 'Вставьте телефон клиента из буфера обмена и повторите запрос.' })
      if (intent.intent === 'clarify')
        return NextResponse.json({ question: 'Уточните: создать новую заявку или изменить существующую? Для изменения укажите клиента, дату или название.' })
      if (intent.intent === 'create') return processEventAiDraft({ ...args, clientPhone: clipboardPhone, strict: true })
    }
    const result = body.eventId ? await prepareAiEdit(args) : await searchAiEditEvents(args)
    return NextResponse.json(result)
  } catch (error) {
    if (isAiBalanceError(error)) return NextResponse.json({ error: getAiBalanceErrorMessage(error) }, { status: 402 })
    return NextResponse.json({ error: error.safe ? error.message : 'Не удалось выполнить запрос. Проверьте результат перед повтором.' }, { status: error.safe ? error.status : 502 })
  }
}
