import { NextResponse } from 'next/server'
import { POST as sharedAssistant } from '../../../../events/ai-edit/route'

// A separate endpoint makes older deployments fail closed. They must never
// ignore an opt-in flag and create a client during native preview/cancellation.
export async function POST(req) {
  let body
  try {
    const raw = await req.text()
    if (raw.length > 16000) return NextResponse.json({ error: 'Запрос слишком длинный' }, { status: 413 })
    body = JSON.parse(raw)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body')
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 })
  }
  const headers = new Headers(req.headers)
  headers.delete('content-length')
  headers.set('content-type', 'application/json')
  return sharedAssistant(new Request(req.url, { method: 'POST', headers, body: JSON.stringify({
    text: body.text, eventId: body.eventId, clipboardPhone: body.clipboardPhone,
    mode: 'auto', deferClientCreation: true,
  }) }))
}
