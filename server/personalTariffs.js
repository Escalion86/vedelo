import Users from '@models/Users'
import Tariffs from '@models/Tariffs'
import Payments from '@models/Payments'
import { createPersonalTariffService } from './personalTariffService.js'

export default createPersonalTariffService({ Users, Tariffs, Payments })
