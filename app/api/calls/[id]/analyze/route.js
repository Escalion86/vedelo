import { NextResponse } from 'next/server'
import Calls from '@models/Calls'
import Services from '@models/Services'
import dbConnect from '@server/dbConnect'
import { analyzeCallTranscript } from '@server/callAiAnalysis'
import { getTenantAiSettings } from '@server/aiSettings'
import { requireAiTariffAccess } from '@server/telephonyAccess'
import {
  getAiBalanceErrorMessage,
  isAiBalanceError,
} from '@server/aiBilling'

export const POST = async (req, { params }) => {
  const { id } = await params
  const access = await requireAiTariffAccess(req)
  if (!access.ok) {
    return NextResponse.json(
      { success: false, error: access.error },
      { status: access.status }
    )
  }
  const { tenantId } = access

  await dbConnect()
  const call = await Calls.findOne({ _id: id, tenantId }).lean()
  if (!call) {
    return NextResponse.json(
      { success: false, error: 'Звонок не найден' },
      { status: 404 }
    )
  }

  await Calls.findOneAndUpdate(
    { _id: id, tenantId },
    { status: 'processing', processingError: '' }
  )

  try {
    const [aiSettings, services] = await Promise.all([
      getTenantAiSettings(access.tenantId, { user: access.user }),
      Services.find({ tenantId }).select('title').lean(),
    ])
    aiSettings.services = services
      .map((service) => service.title)
      .filter(Boolean)
    const analysis = await analyzeCallTranscript(call.transcript, aiSettings, {
      feature: 'call_analysis',
      groupId: `call:${id}`,
      referenceDate: call.startedAt ?? new Date(),
    })
    const updatedCall = await Calls.findOneAndUpdate(
      { _id: id, tenantId },
      {
        status: 'ready',
        aiSummary: analysis.summary,
        aiExtractedFields: analysis.extractedFields,
        analysisProvider: analysis.provider || '',
        analysisModel: analysis.provider === 'local' ? '' : analysis.model || '',
        processingError: '',
      },
      { returnDocument: 'after' }
    ).lean()

    return NextResponse.json(
      { success: true, data: updatedCall },
      { status: 200 }
    )
  } catch (error) {
    const processingError = isAiBalanceError(error)
      ? getAiBalanceErrorMessage(error)
      : 'AI-анализ временно недоступен'
    const updatedCall = await Calls.findOneAndUpdate(
      { _id: id, tenantId },
      {
        status: 'failed',
        processingError,
      },
      { returnDocument: 'after' }
    ).lean()
    console.error('[calls/analyze] failed', {
      callId: id,
      message: error?.message,
    })
    return NextResponse.json(
      {
        success: false,
        error: processingError,
        data: updatedCall,
      },
      { status: isAiBalanceError(error) ? 402 : 502 }
    )
  }
}
