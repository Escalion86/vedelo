import SiteSettings from '@models/SiteSettings'
import dbConnect from '@server/dbConnect'

export const getPhoneAuthSettings = async () => {
  await dbConnect()
  const settings = await SiteSettings.findOne({ tenantId: null })
    .select('phoneVerification.primaryMethod')
    .lean()
  return {
    primaryMethod:
      settings?.phoneVerification?.primaryMethod === 'sms' ? 'sms' : 'call',
  }
}

export const getPhoneProviderStatus = () => ({
  callConfigured: Boolean(process.env.TELEFONIP),
  smsConfigured: Boolean(
    process.env.PHONE_SMS_SEND_WEBHOOK || process.env.TELEFONIP
  ),
  smsProvider: process.env.PHONE_SMS_SEND_WEBHOOK ? 'webhook' : 'telefonip',
})
