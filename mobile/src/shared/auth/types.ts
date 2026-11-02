export type MobileUser = {
  _id: string
  tenantId: string
  firstName: string
  secondName: string
  thirdName?: string
  phone: string
  email: string
  whatsapp?: string
  viber?: string
  telegram?: string
  vk?: string
  instagram?: string
  images?: string[]
  role: string
  tariffId: string | null
  tariffTitle?: string
  registrationType?: string
  yandexLinked?: boolean
}

export type AuthSession = {
  accessToken: string
  refreshToken: string
  expiresIn: number
  tokenType: 'Bearer'
  user: MobileUser
}
