import ProposalTemplateEditor from '@components/ProposalTemplateEditor'

const proposalTemplateFunc = (template = null, onSaved = null) => ({
  title: template?._id
    ? 'Редактирование шаблона предложения'
    : 'Новый шаблон предложения',
  confirmButtonName: 'Сохранить',
  Children: ProposalTemplateEditor,
  childrenProps: { template, onSaved },
})

export default proposalTemplateFunc
