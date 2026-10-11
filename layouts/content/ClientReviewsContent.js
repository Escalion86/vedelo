'use client'

import { useId, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faFilter } from '@fortawesome/free-solid-svg-icons'
import AppButton from '@components/AppButton'
import InputWrapper from '@components/InputWrapper'
import PeriodPicker from '@components/PeriodPicker'
import ClientReviewsList from '@components/ClientReviewsList'
import styles from './ClientReviewsContent.module.css'

export default function ClientReviewsContent() {
  const [rating, setRating] = useState('')
  const [unread, setUnread] = useState('')
  const [period, setPeriod] = useState({ from: '', to: '' })
  const { from, to } = period
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filtersId = useId()
  const activeCount = [rating, unread, from, to].filter(Boolean).length
  const summary = [
    rating && `${rating} из 5`,
    unread && 'Непрочитанные',
    from && `С ${from}`,
    to && `По ${to}`,
  ]
    .filter(Boolean)
    .join(' · ')
  const resetFilters = () => {
    setRating('')
    setUnread('')
    setPeriod({ from: '', to: '' })
  }
  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="sr-only">Отзывы клиентов</h1>
        <div className={styles.panel}>
          <div className={styles.header}>
            <AppButton
              variant="secondary"
              size="sm"
              className={styles.toggle}
              aria-expanded={filtersOpen}
              aria-controls={filtersId}
              onClick={() => setFiltersOpen((value) => !value)}
            >
              <FontAwesomeIcon icon={faFilter} className="h-3 w-3" />
              Фильтры{activeCount ? ` (${activeCount})` : ''}
              <FontAwesomeIcon
                icon={faChevronDown}
                className={`h-3 w-3 ${filtersOpen ? 'rotate-180' : ''}`}
              />
            </AppButton>
            {activeCount ? (
              <AppButton
                variant="ghost"
                size="sm"
                className={styles.reset}
                aria-label="Сбросить фильтры"
                onClick={resetFilters}
              >
                Сбросить
              </AppButton>
            ) : null}
          </div>
          {activeCount ? (
            <div className={`card-muted ${styles.summary}`} title={summary}>
              {summary}
            </div>
          ) : null}
          <div id={filtersId} hidden={!filtersOpen}>
            {filtersOpen ? (
              <div className={styles.fields}>
                <InputWrapper
                  label="Оценка"
                  noMargin
                  className="min-w-0"
                  wrapperClassName="min-w-0"
                  paddingY={false}
                >
                  <select
                    aria-label="Оценка"
                    className="w-full min-w-0 cursor-pointer bg-transparent"
                    value={rating}
                    onChange={(e) => setRating(e.target.value)}
                  >
                    <option value="">Все оценки и запросы</option>
                    {[5, 4, 3, 2, 1].map((value) => (
                      <option key={value} value={value}>
                        {value} из 5
                      </option>
                    ))}
                  </select>
                </InputWrapper>
                <InputWrapper
                  label="Прочтение"
                  noMargin
                  className="min-w-0"
                  wrapperClassName="min-w-0"
                  paddingY={false}
                >
                  <select
                    aria-label="Прочтение"
                    className="w-full min-w-0 cursor-pointer bg-transparent"
                    value={unread}
                    onChange={(e) => setUnread(e.target.value)}
                  >
                    <option value="">Все</option>
                    <option value="true">Непрочитанные</option>
                  </select>
                </InputWrapper>
                <PeriodPicker
                  className="col-span-2"
                  label="Период запросов"
                  value={period}
                  onChange={setPeriod}
                />
              </div>
            ) : null}
          </div>
        </div>
        <ClientReviewsList
          key={`${rating}:${unread}:${from}:${to}`}
          filters={{ rating, unread, from, to }}
        />
      </div>
    </div>
  )
}
