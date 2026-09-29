'use client'

import { useState } from 'react'
import InputWrapper from '@components/InputWrapper'
import Input from '@components/Input'
import ClientReviewsList from '@components/ClientReviewsList'

export default function ClientReviewsContent() {
  const [rating, setRating] = useState('')
  const [unread, setUnread] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="sr-only">Отзывы клиентов</h1>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <InputWrapper label="Оценка">
            <select
              aria-label="Оценка"
              className="w-full cursor-pointer bg-transparent"
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
          <InputWrapper label="Прочтение">
            <select
              aria-label="Прочтение"
              className="w-full cursor-pointer bg-transparent"
              value={unread}
              onChange={(e) => setUnread(e.target.value)}
            >
              <option value="">Все</option>
              <option value="true">Непрочитанные</option>
            </select>
          </InputWrapper>
          <Input
            label="Запросы с даты"
            type="date"
            value={from}
            onChange={setFrom}
          />
          <Input
            label="По дату включительно"
            type="date"
            value={to}
            onChange={setTo}
          />
        </div>
        <ClientReviewsList
          key={`${rating}:${unread}:${from}:${to}`}
          filters={{ rating, unread, from, to }}
        />
      </div>
    </div>
  )
}
