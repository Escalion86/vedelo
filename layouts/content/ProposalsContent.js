'use client'

import { useAtomValue } from 'jotai'
import LabeledContainer from '@components/LabeledContainer'
import Notice from '@components/Notice'
import ProposalTemplatesPanel from '@components/ProposalTemplatesPanel'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import tariffsAtom from '@state/atoms/tariffsAtom'
import { getUserTariffAccess } from '@helpers/tariffAccess'
import {
  canUseProposalBuilder,
  PROPOSAL_BUILDER_ACCESS_ERROR,
} from '@helpers/proposalAccess'

const ProposalsContent = () => {
  const loggedUser = useAtomValue(loggedUserAtom)
  const tariffs = useAtomValue(tariffsAtom)
  const allowed = canUseProposalBuilder(getUserTariffAccess(loggedUser, tariffs))

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      {allowed ? (
        <LabeledContainer
          label="Шаблоны коммерческих предложений"
          help="Создайте шаблон с текстом, блоками, фото и видео. Затем в редакторе мероприятия или заказа создайте КП на его основе, настройте варианты и цены, опубликуйте и отправьте клиенту ссылку. Сам шаблон клиенту не отправляется."
          noMargin
        >
          <ProposalTemplatesPanel enabled={allowed} />
        </LabeledContainer>
      ) : (
        <Notice tone="warning">{PROPOSAL_BUILDER_ACCESS_ERROR}</Notice>
      )}
    </div>
  )
}
export default ProposalsContent
