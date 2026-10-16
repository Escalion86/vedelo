import SiteSettings from '@models/SiteSettings'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { createClientTypesHandlers } from '@server/clientTypes'

const handlers = createClientTypesHandlers({
  Settings: SiteSettings, connect: dbConnect, getContext: getRequestContext,
})
export const GET = handlers.GET
export const PUT = handlers.PUT
