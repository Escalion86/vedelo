import StatusChip from '@components/StatusChip'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleCheck, faPaperPlane } from '@fortawesome/free-solid-svg-icons'

export default function ProposalStatusChip({ status }) {
  if (status !== 'accepted' && status !== 'sent') return null
  const accepted = status === 'accepted'
  return (
    <StatusChip tone={accepted ? 'success' : 'info'} className="max-w-max shrink-0">
      <FontAwesomeIcon icon={accepted ? faCircleCheck : faPaperPlane} aria-hidden="true" />
      {accepted ? 'КП принято' : 'КП отправлено'}
    </StatusChip>
  )
}
