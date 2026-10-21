'use client'

import { sanitizeProposalRichText } from '@helpers/proposalRichText'

const ProposalRichTextView = ({ html, className = '', phone }) => {
  const content = sanitizeProposalRichText(html, { phone })
  if (!content) return null
  return (
    <div
      className={`proposal-rich-text-content ${className}`}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  )
}

export default ProposalRichTextView
