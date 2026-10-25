import Users from '@models/Users'
import PromoCodes from '@models/PromoCodes'
import Tariffs from '@models/Tariffs'
import Payments from '@models/Payments'
import { createPromoCodeService } from './promoCodeService.mjs'

export default createPromoCodeService({ Users, PromoCodes, Tariffs, Payments })
