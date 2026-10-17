import SiteSettings from '@models/SiteSettings'
import Events from '@models/Events'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { createEventTypeListHandlers } from '@server/eventTypeList'

const handlers = createEventTypeListHandlers({ Settings: SiteSettings, Events, connect: dbConnect, getContext: getRequestContext })
export const GET = handlers.GET
export const PUT = handlers.PUT
