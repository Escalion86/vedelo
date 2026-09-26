'use client'

import Image from 'next/image'
import Notice from '@components/Notice'
import ProposalRichTextView from '@components/ProposalRichTextView'
import { formatMoney } from '@helpers/formatMoney'

const proposalImageLoader = ({ src }) => src

export default function ProposalPageView({
  proposal,
  error = '',
  sending = '',
  selectPackage = () => {},
  preview = false,
}) {
  const blocks = new Map(
    (proposal.blocks || [])
      .filter((item) => item.enabled !== false)
      .map((item) => [item.type, item])
  )
  const cover = blocks.get('cover')
  const intro = blocks.get('intro')
  const packagesBlock = blocks.get('packages')
  const mediaBlock = blocks.get('media')
  const benefits = blocks.get('benefits')
  const terms = blocks.get('terms')
  const contacts = blocks.get('contacts')
  const cta = blocks.get('cta')
  const validUntil = proposal.validUntil
    ? new Date(proposal.validUntil).toLocaleDateString('ru-RU')
    : ''

  return (
    <main className="proposal-page-view tablet:px-6 tablet:py-10 bg-stone-100 px-3 py-5 text-stone-900">
      <article className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-stone-200 bg-[#ffffff] shadow-xl shadow-stone-300/30">
        <header className="tablet:px-10 tablet:py-14 bg-gradient-to-br from-stone-950 via-stone-800 to-amber-950 px-5 py-10 text-white">
          <div className="text-xs font-semibold tracking-[0.22em] text-amber-300 uppercase">
            Персональное предложение
          </div>
          <h1 className="tablet:text-5xl mt-3 text-3xl font-semibold tracking-tight">
            {cover?.title || proposal.title}
          </h1>
          {proposal.client?.firstName ? (
            <p className="mt-4 text-lg text-stone-200">
              Для {proposal.client.firstName}
            </p>
          ) : null}
          {validUntil ? (
            <p className="mt-6 text-sm text-stone-300">
              Действует до {validUntil}
            </p>
          ) : null}
        </header>

        <div className="tablet:px-10 tablet:py-10 space-y-9 px-4 py-7">
          {intro ? (
            <section>
              <h2 className="text-2xl font-semibold">{intro.title}</h2>
              <ProposalRichTextView
                html={intro.contentHtml}
                className="mt-3 leading-7 text-stone-600"
              />
            </section>
          ) : null}

          {packagesBlock ? (
            <section>
              <h2 className="text-2xl font-semibold">{packagesBlock.title}</h2>
              <div className="mt-4 grid gap-4">
                {proposal.packages.map((item) => {
                  const selected = proposal.selectedPackageId === item.id
                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border p-5 transition ${selected ? 'border-emerald-500 bg-[#ecfdf5] shadow-sm' : item.recommended ? 'border-amber-400 bg-amber-50/50' : 'border-stone-200'}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-xl font-semibold">
                              {item.title}
                            </h3>
                            {item.recommended ? (
                              <span className="rounded-full bg-amber-200 px-2 py-1 text-xs font-semibold text-amber-900">
                                Рекомендуем
                              </span>
                            ) : null}
                          </div>
                          {item.description ? (
                            <p className="mt-2 text-sm leading-6 text-stone-600">
                              {item.description}
                            </p>
                          ) : null}
                        </div>
                        <div className="text-xl font-bold">
                          {formatMoney(item.total)}
                        </div>
                      </div>
                      {item.lines?.length ? (
                        <ul className="mt-4 space-y-2 border-t border-stone-200 pt-4">
                          {item.lines.map((line, index) => (
                            <li
                              key={`${line.title}-${index}`}
                              className="flex justify-between gap-4 text-sm"
                            >
                              <div className="min-w-0 break-words">
                                <span>{line.title}</span>
                                {line.description ? (
                                  <p className="mt-1 text-xs leading-5 whitespace-pre-line text-stone-600">
                                    {line.description}
                                  </p>
                                ) : null}
                              </div>
                              {line.price ? (
                                <span className="shrink-0 font-medium">
                                  {formatMoney(line.price)}
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <button
                        type="button"
                        disabled={
                          preview || proposal.expired || Boolean(sending)
                        }
                        onClick={() => selectPackage(item.id)}
                        className="mt-5 h-12 w-full cursor-pointer rounded-xl bg-stone-900 px-4 font-semibold text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {selected
                          ? 'Вы выбрали этот вариант'
                          : sending === item.id
                            ? 'Сохраняем…'
                            : 'Выбрать вариант'}
                      </button>
                    </div>
                  )
                })}
              </div>
              {proposal.expired ? (
                <Notice tone="warning" className="mt-4">
                  Срок действия предложения истёк. Свяжитесь с артистом для
                  обновления условий.
                </Notice>
              ) : null}
              {error ? (
                <Notice tone="error" className="mt-4">
                  {error}
                </Notice>
              ) : null}
            </section>
          ) : null}

          {mediaBlock && proposal.media?.length ? (
            <section>
              <h2 className="text-2xl font-semibold">{mediaBlock.title}</h2>
              <div className="tablet:grid-cols-2 mt-4 grid gap-3">
                {proposal.media.map((item) =>
                  item.kind === 'image' ? (
                    <Image
                      key={item.id}
                      src={item.url}
                      alt={item.title || 'Фото артиста'}
                      width={800}
                      height={450}
                      loader={proposalImageLoader}
                      className="aspect-video w-full rounded-2xl object-cover"
                    />
                  ) : item.kind === 'video' ? (
                    <video
                      key={item.id}
                      src={item.url}
                      controls
                      preload="metadata"
                      className="aspect-video w-full rounded-2xl bg-black"
                    />
                  ) : (
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex aspect-video items-center justify-center rounded-2xl border border-stone-200 bg-stone-100 p-5 text-center font-semibold text-stone-700 hover:bg-stone-200"
                    >
                      {item.title || 'Открыть видео'}
                    </a>
                  )
                )}
              </div>
            </section>
          ) : null}

          {benefits?.contentHtml || benefits?.items?.length ? (
            <section>
              <h2 className="text-2xl font-semibold">{benefits.title}</h2>
              <ProposalRichTextView
                html={benefits.contentHtml}
                className="mt-4 leading-7 text-stone-600"
              />
            </section>
          ) : null}
          {terms?.contentHtml ? (
            <section>
              <h2 className="text-2xl font-semibold">{terms.title}</h2>
              <ProposalRichTextView
                html={terms.contentHtml}
                className="mt-3 leading-7 text-stone-600"
              />
            </section>
          ) : null}
          {cta ? (
            <section className="rounded-2xl bg-stone-900 p-6 text-white">
              <h2 className="text-2xl font-semibold">{cta.title}</h2>
              <ProposalRichTextView
                html={cta.contentHtml}
                className="mt-2 text-stone-300"
              />
            </section>
          ) : null}
          {contacts ? (
            <footer className="border-t border-stone-200 pt-6 text-sm text-stone-600">
              <div className="font-semibold text-stone-900">
                {proposal.artist?.fullName || contacts.title}
              </div>
              {proposal.artist?.phone ? (
                <div className="mt-1">{proposal.artist.phone}</div>
              ) : null}
              {proposal.artist?.telegram ? (
                <div className="mt-1">Telegram: {proposal.artist.telegram}</div>
              ) : null}
              <div className="mt-5 text-xs text-stone-400">
                Предложение подготовлено в Ведело
              </div>
            </footer>
          ) : null}
        </div>
      </article>
    </main>
  )
}
