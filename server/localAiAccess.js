import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { isLocalAiDeveloper } from '@server/aiSettings'

export const getLocalAiDeveloperContext = async (req) => {
  const { user, tenantId } = await getRequestContext(req)
  if (!user || !tenantId) return { status: 401, error: 'Не авторизован' }
  if (isLocalAiDeveloper(user, tenantId)) {
    await dbConnect()
    const owner = await Users.findById(tenantId).select('_id role archive').lean()
    if (isLocalAiDeveloper(owner, tenantId)) return { user, tenantId, owner }
  }
  return {
    status: 403,
    error: 'Локальный ИИ доступен только владельцу с ролью разработчика',
  }
}
