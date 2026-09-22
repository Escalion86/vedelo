import { NextResponse } from 'next/server'
import getTenantContext from '@server/getTenantContext'
import dbConnect from '@server/dbConnect'
import LearningProgress from '@models/LearningProgress'
import {
  learningScope,
  learningSnapshot,
  updateLearningProgress,
} from '@server/learningProgress.mjs'

const response = (body, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
const failure = (error) =>
  response(
    {
      error: error.status
        ? error.message
        : 'Не удалось сохранить обучение. Повторите попытку.',
    },
    error.status || 500
  )

export async function GET() {
  try {
    const scope = learningScope(await getTenantContext())
    await dbConnect()
    const row = await LearningProgress.findOne(scope).lean()
    return response({ data: learningSnapshot(row || {}) })
  } catch (error) {
    return failure(error)
  }
}

export async function POST(req) {
  try {
    const context = await getTenantContext()
    learningScope(context)
    const command = await req.json().catch(() => null)
    await dbConnect()
    const data = await updateLearningProgress(
      LearningProgress,
      context,
      command
    )
    return response({ data })
  } catch (error) {
    return failure(error)
  }
}
