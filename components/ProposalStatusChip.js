import StatusChip from '@components/StatusChip'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCircleCheck,
  faExternalLinkAlt,
  faPaperPlane,
} from '@fortawesome/free-solid-svg-icons'

const STATUS_CHIP = {
  accepted: { tone: 'success', icon: faCircleCheck, label: 'КП принято' },
  sent: { tone: 'info', icon: faPaperPlane, label: 'КП отправлено' },
  published: {
    tone: 'neutral',
    icon: faExternalLinkAlt,
    label: 'КП опубликовано',
  },
}

export default function ProposalStatusChip({ status }) {
  const chip = STATUS_CHIP[status]
  if (!chip) return null
  return (
    <StatusChip tone={chip.tone} className="max-w-max shrink-0">
      <FontAwesomeIcon
        icon={chip.icon}
        className="mr-1 h-3 w-3"
        aria-hidden="true"
      />
      {chip.label}
    </StatusChip>
  )
}
