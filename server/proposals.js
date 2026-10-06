import crypto from 'crypto'
import { formatMoney } from '@helpers/formatMoney'
import getPersonFullName from '@helpers/getPersonFullName'
import {
  DEFAULT_PROPOSAL_MESSAGE,
  buildProposalDefaultLines,
  normalizeProposalMessage,
  normalizeProposalBlocks,
  normalizeProposalMedia,
  normalizeProposalPackages,
  renderProposalVariables,
} from '@helpers/proposalContent'

const tokenSecret = () =>
  process.env.NEXTAUTH_SECRET || process.env.PASSWORD || process.env.LOGIN || 'artistcrm-proposal-development-secret'
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')

export const createProposalPublicCredentials = (proposalId) => {
  const publicId = crypto.randomBytes(16).toString('base64url')
  const nonce = crypto.randomBytes(24).toString('base64url')
  const token = crypto
    .createHmac('sha256', tokenSecret())
    .update(`${proposalId}:${publicId}:${nonce}`)
    .digest('base64url')
  return { publicId, nonce, token, tokenHash: hash(token) }
}

export const recoverProposalPublicToken = (proposal) =>
  crypto
    .createHmac('sha256', tokenSecret())
    .update(`${proposal._id}:${proposal.publicId}:${proposal.publicTokenNonce}`)
    .digest('base64url')

export const isValidProposalToken = (proposal, token) => {
  const expected = Buffer.from(proposal.publicTokenHash || '', 'hex')
  const actual = Buffer.from(hash(String(token || '')), 'hex')
  return expected.length > 0 && expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

export const buildProposalPublicUrl = (proposal, origin = '') => {
  const token = recoverProposalPublicToken(proposal)
  const rawOrigin = String(origin || '').trim().replace(/\/$/, '')
  const normalizedOrigin = rawOrigin && !/^https?:\/\//i.test(rawOrigin)
    ? `https://${rawOrigin}`
    : rawOrigin
  return `${normalizedOrigin}/proposal/${proposal.publicId}/${token}`
}

export const buildProposalVariables = ({ event, client, services, artist }) => {
  const eventDate = event?.eventDate ? new Date(event.eventDate) : null
  const serviceTitles = services.map((item) => item.title).filter(Boolean)
  return {
    client: {
      firstName: client?.firstName || '',
      fullName: getPersonFullName(client) || '',
    },
    event: {
      type: event?.eventType || '',
      date: eventDate && !Number.isNaN(eventDate.getTime())
        ? eventDate.toLocaleDateString('ru-RU')
        : '',
      services: serviceTitles.join(', '),
      sum: event?.contractSum ? formatMoney(event.contractSum) : '',
    },
    artist: {
      firstName: artist?.firstName || '',
      fullName: getPersonFullName(artist) || artist?.firstName || '',
      phone: artist?.phone || '',
      telegram: artist?.telegram || '',
    },
  }
}

export const buildProposalSnapshot = ({ template, event, client, services, artist, templateServices = [], input = {} }) => {
  const variables = buildProposalVariables({ event, client, services, artist })
  const sourceBlocks = input.blocks || template?.blocks
  const blocksSnapshot = normalizeProposalBlocks(sourceBlocks).map((block) => ({
    ...block,
    title: renderProposalVariables(block.title, variables).text,
    text: renderProposalVariables(block.text, variables).text,
  }))
  // Услуги шаблона заполняют вариант сразу; без выбранных услуг поведение
  // прежнее — вариант собирается из услуг заявки.
  const defaultLines = buildProposalDefaultLines({
    templateDefaults: template?.defaults,
    templateServices,
    eventServices: services,
  })
  const packages = normalizeProposalPackages(
    input.packages?.length
      ? input.packages
      : [{ id: 'main', title: 'Основной вариант', lines: defaultLines, total: Number(event.contractSum) || defaultLines.reduce((sum, line) => sum + line.price, 0), recommended: true }]
  )
  const rawMessage = normalizeProposalMessage(input.messageText || template?.messageTemplate || DEFAULT_PROPOSAL_MESSAGE)
  return {
    blocksSnapshot,
    packages,
    mediaSnapshot: normalizeProposalMedia(input.media || template?.media),
    messageTemplate: rawMessage,
    eventSnapshot: {
      ...variables.event,
      eventType: event.eventType || '',
      eventDate: event.eventDate || null,
      servicesData: services.map((item) => ({ id: String(item._id), title: item.title, price: Number(item.price) || 0 })),
    },
    clientSnapshot: { firstName: client?.firstName || '', fullName: getPersonFullName(client) || '' },
    artistSnapshot: { fullName: getPersonFullName(artist) || '', phone: artist?.phone || '', telegram: artist?.telegram || '' },
  }
}

export const renderProposalMessage = (proposal, publicUrl) =>
  renderProposalVariables(normalizeProposalMessage(proposal.messageText || ''), {
    proposal: { url: publicUrl },
    client: proposal.clientSnapshot || {},
    event: proposal.eventSnapshot || {},
    artist: proposal.artistSnapshot || {},
  }).text
