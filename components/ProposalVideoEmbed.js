import { getProposalVideoEmbed } from '@helpers/proposalVideoEmbed.mjs'
import styles from './ProposalPageView.module.css'

export default function ProposalVideoEmbed({ item }) {
  const embed = getProposalVideoEmbed(item.url)
  return (
    <div className="min-w-0 space-y-2 self-start">
      {embed ? (
        <iframe
          src={embed.src}
          title={`${embed.provider}: ${item.title || 'Видео'}`}
          className={`${styles.videoLink} aspect-video w-full rounded-2xl border`}
          loading="lazy"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin"
        />
      ) : null}
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${styles.videoLink} block rounded-lg border p-3 text-center text-sm underline`}
      >
        {embed ? `Открыть на ${embed.provider}` : 'Открыть видео на сайте'}
      </a>
    </div>
  )
}
