export const canUseProposalBuilder = (access) => Boolean(access?.allowProposals)

export const PROPOSAL_BUILDER_ACCESS_ERROR =
  'Коммерческие предложения недоступны на текущем тарифе'
