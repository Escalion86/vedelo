import ProposalPublicClient from './ProposalPublicClient'
import { getProposalMetadata } from '@server/proposalMetadata'

export const dynamic = 'force-dynamic'

export const generateMetadata = async ({ params }) => {
  const { publicId, token } = await params
  return getProposalMetadata(publicId, token)
}

const ProposalPage = async ({ params }) => {
  const { publicId, token } = await params
  return <ProposalPublicClient publicId={publicId} token={token} />
}

export default ProposalPage
