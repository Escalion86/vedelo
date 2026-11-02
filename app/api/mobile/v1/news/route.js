import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { readUserNews, newsReaderScope } from '@server/newsReader'
import { mobileError, mobileSuccess } from '@server/mobile/routeHelpers'

export const GET = async req => {
  try {
    const context = await getRequestContext(req)
    newsReaderScope(context)
    await dbConnect()
    return mobileSuccess(await readUserNews(context))
  } catch (error) {
    return mobileError('NEWS_UNAVAILABLE', error.status === 401 ? 'Не авторизован' : 'Не удалось загрузить новости', error.status || 500)
  }
}
