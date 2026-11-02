import SiteSettings from '@models/SiteSettings'
import Tariffs from '@models/Tariffs'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { learningScope } from '@server/learningProgress.mjs'
import { getLearningArticles } from '@helpers/learningCatalog.mjs'
import { getLearningAccess } from '@helpers/learningAccess.mjs'
import { resolveWorkItemTerminology } from '@helpers/workItemTerminology.mjs'
import { mobileError, mobileSuccess } from '@server/mobile/routeHelpers'

export async function GET(req) {
  try {
    const context = await getRequestContext(req)
    const { tenantId } = learningScope(context)
    await dbConnect()
    const [settings, tariffs] = await Promise.all([
      SiteSettings.findOne({ tenantId }).lean(),
      Tariffs.find({}).lean(),
    ])
    return mobileSuccess({
      articles: getLearningArticles(resolveWorkItemTerminology(settings || {})).map(article => ({
        ...article,
        access: getLearningAccess(article, context.user, tariffs),
      })),
    })
  } catch (error) {
    return mobileError('LEARNING_UNAVAILABLE', error.status === 401 ? 'Не авторизован' : 'Не удалось загрузить обучение', error.status || 500)
  }
}
