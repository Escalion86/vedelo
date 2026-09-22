'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useAtomValue } from 'jotai'
import modalsFuncAtom from '@state/atoms/modalsFuncAtom'
import Notice from '@components/Notice'
import useWorkItemTerminology from '@helpers/useWorkItemTerminology'
import { getLearningArticles } from '@helpers/learningCatalog.mjs'
import { useLearning } from '@helpers/useLearning'
import useLearningAccess from '@helpers/useLearningAccess'
import styles from '@components/Learning.module.css'

export default function LearningContent() {
  const articles = getLearningArticles(useWorkItemTerminology())
  const getAccess = useLearningAccess()
  const categories = [...new Set(articles.map((item) => item.category))]
  const { data, isError, isPending, refetch, mutation } = useLearning()
  const modals = useAtomValue(modalsFuncAtom)
  const selectedId = useSearchParams().get('article')
  const selectedRef = useRef(null)
  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.open = true
      selectedRef.current.scrollIntoView({ block: 'start' })
      selectedRef.current
        .querySelector('summary')
        ?.focus({ preventScroll: true })
    }
  }, [selectedId])
  const learned = new Set([...(data?.readIds || []), ...(data?.knownIds || [])])
  const tipsEnabled =
    mutation.isPending && mutation.variables?.action === 'preference'
      ? mutation.variables.enabled
      : (data?.enabled ?? false)
  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <section className={`${styles.card} ${styles.intro}`}>
          <div>
            <p className={styles.eyebrow}>Осваивайте Ведело в своём темпе</p>
            <h2 className={styles.title}>Знакомство с Ведело</h2>
            <p className={styles.description}>
              Пройдите путь от заявки до оплаты на учебном примере. Затем
              выбирайте короткие инструкции для своих задач.
            </p>
          </div>
          <button
            type="button"
            className={styles.primary}
            disabled={!modals.user?.firstRunTour}
            onClick={() => modals.user?.firstRunTour?.()}
          >
            Показать на примере
          </button>
        </section>
        {isError ? (
          <Notice tone="error" role="alert" className="mt-4">
            Не удалось загрузить ваши отметки. Материалы доступны.{' '}
            <button
              type="button"
              className={styles.textLink}
              onClick={() => refetch()}
            >
              Повторить загрузку
            </button>
          </Notice>
        ) : null}
        <div className={styles.preference}>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={tipsEnabled}
              disabled={!data || mutation.isPending}
              onChange={(event) =>
                mutation.mutate({
                  action: 'preference',
                  enabled: event.target.checked,
                })
              }
            />
            Показывать полезные советы в «Важном»
          </label>
          <span className={styles.progress}>
            {isPending
              ? 'Загружаем ваши отметки…'
              : data
                ? `Изучено ${learned.size} из ${articles.length}`
                : 'Отметки недоступны'}
          </span>
        </div>
        {mutation.isError ? (
          <Notice tone="error" role="alert" className="mb-4">
            Не удалось сохранить изменение. Повторите действие.
          </Notice>
        ) : null}
        {categories.map((category) => (
          <section key={category} aria-label={category}>
            <h2 className={styles.category}>{category}</h2>
            <div className={styles.list}>
              {articles
                .filter((item) => item.category === category)
                .map((article) => {
                  const access = getAccess(article)
                  return (
                    <details
                      className={`${styles.card} ${styles.article}`}
                      key={article.id}
                      ref={article.id === selectedId ? selectedRef : undefined}
                    >
                      <summary className={styles.summary}>
                        <span>
                          <span className={styles.articleTitle}>
                            {article.title}
                          </span>
                          <span className={styles.meta}>
                            {data?.knownIds.includes(article.id)
                              ? 'Уже знаете'
                              : data?.readIds.includes(article.id)
                                ? 'Прочитано'
                                : '1 минута · Короткая инструкция'}
                          </span>
                          {!access.available ? (
                            <span className={styles.tariffBadge}>
                              {access.label}
                            </span>
                          ) : null}
                        </span>
                      </summary>
                      <div className={styles.body}>
                        <p className={styles.description}>{article.summary}</p>
                        {!access.available ? (
                          <Notice tone="neutral" className="mt-3">
                            {access.label}. Инструкцию можно изучить заранее.
                            Для использования функции выберите тариф, в котором
                            она включена.
                          </Notice>
                        ) : null}
                        <ol className={styles.steps}>
                          {article.steps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                        <div className={styles.actions}>
                          <Link
                            href={
                              access.available
                                ? article.href
                                : '/cabinet/tariff-select'
                            }
                            className={styles.primary}
                          >
                            {access.available
                              ? article.action
                              : 'Посмотреть тарифы'}
                          </Link>
                          <button
                            type="button"
                            className={styles.secondary}
                            disabled={
                              !data ||
                              mutation.isPending ||
                              learned.has(article.id)
                            }
                            onClick={() =>
                              mutation.mutate({
                                action: 'read',
                                articleId: article.id,
                              })
                            }
                          >
                            {learned.has(article.id)
                              ? 'Изучено'
                              : 'Отметить прочитанным'}
                          </button>
                        </div>
                      </div>
                    </details>
                  )
                })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
