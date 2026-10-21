import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faVk } from '@fortawesome/free-brands-svg-icons/faVk'
import { faTelegramPlane } from '@fortawesome/free-brands-svg-icons/faTelegramPlane'
import { faInstagram } from '@fortawesome/free-brands-svg-icons/faInstagram'
import { faWhatsapp } from '@fortawesome/free-brands-svg-icons/faWhatsapp'
import { faViber } from '@fortawesome/free-brands-svg-icons/faViber'
import { getProposalArtistContactLinks } from '@helpers/proposalArtistContacts.mjs'
import styles from './ProposalPageView.module.css'

const icons = { vk: faVk, telegram: faTelegramPlane, instagram: faInstagram, whatsapp: faWhatsapp, viber: faViber }

export default function ProposalContactLinks({ artist }) {
  const links = getProposalArtistContactLinks(artist)
  if (!links.length) return null
  return (
    <nav aria-label="Соцсети и мессенджеры" className="mt-3 flex flex-wrap gap-2">
      {links.map(item => (
        <a key={item.id} href={item.url} title={item.label} aria-label={item.label}
          target="_blank" rel="noopener noreferrer"
          className={`${styles.contactLink} inline-flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-full border px-2`}>
          {icons[item.id] ? <FontAwesomeIcon icon={icons[item.id]} className="h-5 w-5" /> : <span className="text-xs font-bold">MAX</span>}
          {item.phone ? <span className="ml-2 text-sm">{item.phone}</span> : null}
        </a>
      ))}
    </nav>
  )
}
