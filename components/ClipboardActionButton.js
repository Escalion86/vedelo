import { faCopy } from '@fortawesome/free-solid-svg-icons/faCopy'
import { faPaste } from '@fortawesome/free-solid-svg-icons/faPaste'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

const ClipboardActionButton = ({ action, onClick, title, large = false }) => (
  <button
    type="button"
    className={
      large
        ? 'action-icon-button action-icon-button--neutral flex h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center rounded'
        : 'flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded border border-gray-300 text-gray-600 transition hover:bg-gray-50'
    }
    onClick={onClick}
    title={title}
    aria-label={title}
  >
    <FontAwesomeIcon
      icon={action === 'copy' ? faCopy : faPaste}
      className={large ? 'h-4 w-4' : 'h-3.5 w-3.5'}
    />
  </button>
)

export default ClipboardActionButton
