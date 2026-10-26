import ProposalTemplateEditor from '@components/ProposalTemplateEditor'

const proposalTemplateFunc = (template = null, onSaved = null, { fromProposal = false } = {}) => ({
  title: template?._id
    ? 'Редактирование шаблона предложения'
    : 'Новый шаблон предложения',
  confirmButtonName: 'Сохранить',
  ...(fromProposal ? { declineButtonBgClassName: 'bg-general' } : {}),
  Children: ProposalTemplateEditor,
  childrenProps: { template, onSaved, fromProposal },
})

export default proposalTemplateFunc
