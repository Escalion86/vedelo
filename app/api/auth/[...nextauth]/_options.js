import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import dbConnect from '@server/dbConnect'
import Users from '@models/Users'
import { verifyVkIdAuthToken } from '@server/vkidAuthToken'
import getAuthSecret from '@server/getAuthSecret'
import { verifyImpersonationTicket } from '@server/impersonationTicket'
import { consumeDomainMigrationCode } from '@server/domainMigration'
import { BRAND } from '@helpers/brand.mjs'

const normalizePhone = (phone) => {
  if (!phone) return ''
  return String(phone).replace(/[^0-9]/g, '')
}

const isHash = (value) => typeof value === 'string' && value.startsWith('$2')

const authSecret = getAuthSecret()

const requestHost = (request) => {
  const headers = request?.headers
  const value =
    typeof headers?.get === 'function'
      ? headers.get('x-forwarded-host') || headers.get('host')
      : headers?.['x-forwarded-host'] || headers?.host || ''
  return String(value).toLowerCase().replace(/:\d+$/, '')
}

const authOptions = {
  // Configure one or more authentication providers
  pages: { signIn: '/login' },
  secret: authSecret,
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        phone: {
          label: 'Phone',
          type: 'text',
        },
        password: {
          label: 'Password',
          type: 'password',
        },
      },
      async authorize(credentials) {
        try {
          const phone = normalizePhone(credentials?.phone)
          const password = credentials?.password ?? ''

          if (!phone || !password) return null

          await dbConnect()

          const numericPhone = Number(phone)
          const phoneQuery = Number.isNaN(numericPhone)
            ? { phone }
            : { $or: [{ phone }, { phone: numericPhone }] }
          const user = await Users.findOne(phoneQuery)
          if (!user) return null

          const passwordValue = user.password ?? ''
          const passwordMatch = isHash(passwordValue)
            ? await bcrypt.compare(password, passwordValue)
            : passwordValue === password

          if (!passwordMatch) return null

          if (!isHash(passwordValue)) {
            const hashed = await bcrypt.hash(password, 10)
            await Users.findByIdAndUpdate(user._id, { password: hashed })
          }

          if (!user.tenantId) {
            await Users.findByIdAndUpdate(user._id, { tenantId: user._id })
          }

          if (user.phone !== phone) {
            await Users.findByIdAndUpdate(user._id, { phone })
          }

          return {
            id: user._id.toString(),
            phone,
            role: user.role ?? 'user',
            tenantId: user.tenantId?.toString() ?? user._id.toString(),
            firstName: user.firstName ?? '',
            secondName: user.secondName ?? '',
            tariffId: user.tariffId?.toString() ?? null,
          }
        } catch (error) {
          console.log({ error })
          return null
        }
      },
    }),
    CredentialsProvider({
      id: 'domain-migration',
      name: 'Перенос в Ведело',
      credentials: {
        code: { label: 'One-time migration code', type: 'password' },
      },
      async authorize(credentials, request) {
        try {
          const host = requestHost(request)
          const isDevelopment = process.env.NODE_ENV !== 'production'
          if (!isDevelopment && host !== BRAND.primaryHost && host !== `www.${BRAND.primaryHost}`) {
            return null
          }
          return await consumeDomainMigrationCode(credentials?.code)
        } catch (error) {
          console.warn('Не удалось погасить код переноса')
          return null
        }
      },
    }),
    CredentialsProvider({
      id: 'impersonation',
      name: 'Developer impersonation',
      credentials: {
        ticket: {
          label: 'Ticket',
          type: 'text',
        },
      },
      async authorize(credentials) {
        try {
          const payload = verifyImpersonationTicket(
            credentials?.ticket,
            authSecret
          )
          if (!payload) return null

          await dbConnect()
          const [originalUser, targetUser] = await Promise.all([
            Users.findById(payload.originalUserId),
            Users.findById(payload.targetUserId),
          ])
          if (!originalUser || originalUser.role !== 'dev' || !targetUser) {
            return null
          }
          if (
            (payload.action === 'start' &&
              String(originalUser._id) === String(targetUser._id)) ||
            (payload.action === 'restore' &&
              String(originalUser._id) !== String(targetUser._id))
          ) {
            return null
          }

          if (!targetUser.tenantId) {
            await Users.findByIdAndUpdate(targetUser._id, {
              tenantId: targetUser._id,
            })
          }

          return {
            id: targetUser._id.toString(),
            phone: targetUser.phone ?? '',
            role: targetUser.role ?? 'user',
            tenantId:
              targetUser.tenantId?.toString() ?? targetUser._id.toString(),
            firstName: targetUser.firstName ?? '',
            secondName: targetUser.secondName ?? '',
            tariffId: targetUser.tariffId?.toString() ?? null,
            impersonation:
              payload.action === 'start'
                ? {
                    active: true,
                    originalUserId: originalUser._id.toString(),
                    originalFirstName: originalUser.firstName ?? '',
                    originalSecondName: originalUser.secondName ?? '',
                  }
                : null,
          }
        } catch (error) {
          console.error('Ошибка переключения учётной записи', error)
          return null
        }
      },
    }),
    CredentialsProvider({
      id: 'vkid',
      name: 'VK ID',
      credentials: {
        token: {
          label: 'Token',
          type: 'text',
        },
      },
      async authorize(credentials) {
        try {
          const token = credentials?.token ?? ''
          const payload = verifyVkIdAuthToken(token, authSecret)
          if (!payload?.uid) return null

          await dbConnect()
          const user = await Users.findById(payload.uid)
          if (!user) return null

          if (!user.tenantId) {
            await Users.findByIdAndUpdate(user._id, { tenantId: user._id })
          }

          return {
            id: user._id.toString(),
            phone: user.phone ?? '',
            role: user.role ?? 'user',
            tenantId: user.tenantId?.toString() ?? user._id.toString(),
            firstName: user.firstName ?? '',
            secondName: user.secondName ?? '',
            tariffId: user.tariffId?.toString() ?? null,
          }
        } catch (error) {
          console.log({ error })
          return null
        }
      },
    }),
    // ...add more providers here
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id
        token.phone = user.phone
        token.role = user.role
        token.tenantId = user.tenantId
        token.firstName = user.firstName
        token.secondName = user.secondName
        token.tariffId = user.tariffId
        token.impersonation = user.impersonation ?? null
        token.domainMigrationId = user.domainMigrationId ?? null
      }
      return token
    },
    async session({ session, token }) {
      session.user._id = token.userId
      session.user.phone = token.phone
      session.user.role = token.role
      session.user.tenantId = token.tenantId
      session.user.firstName = token.firstName
      session.user.secondName = token.secondName
      session.user.tariffId = token.tariffId ?? null
      session.user.impersonation = token.impersonation ?? null
      session.user.domainMigrationId = token.domainMigrationId ?? null
      session.user.name = token.phone
      return session
    },
  },
}

export default authOptions
