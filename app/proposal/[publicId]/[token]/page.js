import ProposalPublicClient from './ProposalPublicClient'

export const metadata = {
  title: 'Персональное предложение — Ведело',
  robots: { index: false, follow: false, nocache: true },
}

const ProposalPage = async ({ params }) => {
  const { publicId, token } = await params
  return <ProposalPublicClient publicId={publicId} token={token} />
}

export default ProposalPage
