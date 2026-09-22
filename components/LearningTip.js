'use client'

import Link from 'next/link'
import { useAtomValue } from 'jotai'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import modalsAtom from '@state/atoms/modalsAtom'
import Notice from '@components/Notice'
import { useLearning } from '@helpers/useLearning'
import useWorkItemTerminology from '@helpers/useWorkItemTerminology'
import { getLearningArticles } from '@helpers/learningCatalog.mjs'
import styles from './Learning.module.css'
import useLearningAccess from '@helpers/useLearningAccess'

export default function LearningTip() {
  const settings = useAtomValue(siteSettingsAtom)
  const modals = useAtomValue(modalsAtom)
  const terms = useWorkItemTerminology()
  const getAccess = useLearningAccess()
  const enabled =
    settings?.custom?.firstRunWizardCompleted === true && modals.length === 0
  const { data, activityQuery, mutation } = useLearning({
    activity: 'present',
    enabled,
  })
  const article = getLearningArticles(terms).find(
    (item) => item.id === data?.tipId
  )
  if (
    !enabled ||
    !activityQuery.isSuccess ||
    !data?.enabled ||
    data.tipDismissed ||
    !article ||
    data.readIds.includes(article.id) ||
    data.knownIds.includes(article.id)
  )
    return null

  const access = getAccess(article)

  return (
    <aside
      className={`${styles.card} ${styles.tip}`}
      aria-label="Полезный совет"
    >
      <div className={styles.tipHeading}>
        <p className={styles.eyebrow}>А знали ли вы, что…</p>
        <button
          type="button"
          className={styles.close}
          aria-label="Скрыть совет до следующего показа"
          disabled={mutation.isPending}
          onClick={() =>
            mutation.mutate({ action: 'dismiss', articleId: article.id })
          }
        >
          ×
        </button>
      </div>
      <h2 className={styles.title}>{article.title}</h2>
      {!access.available ? (
        <p className={styles.tariffBadge}>{access.label}</p>
      ) : null}
      <p className={styles.description}>{article.summary}</p>
      <div className={styles.actions}>
        <Link
          className={styles.primary}
          href={`/cabinet/learning?article=${article.id}`}
        >
          Как это сделать
        </Link>
        <button
          className={styles.secondary}
          type="button"
          disabled={mutation.isPending}
          onClick={() =>
            mutation.mutate({ action: 'known', articleId: article.id })
          }
        >
          Уже знаю
        </button>
        <Link className={styles.textLink} href="/cabinet/learning">
          Все материалы
        </Link>
      </div>
      {mutation.isError ? (
        <Notice tone="error" role="alert" className="mt-3">
          Не удалось сохранить отметку. Повторите действие.
        </Notice>
      ) : null}
    </aside>
  )
}
