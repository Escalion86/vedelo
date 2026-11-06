'use client'

import Image from 'next/image'
import { useState } from 'react'
import styles from './HomeLanding.module.css'

const examples = [
  {
    key: 'order',
    title: 'Помните договорённости',
    text: 'Клиент, услуга, дата и стоимость — в одной карточке заказа.',
    label: 'Карточка заказа',
    alt: 'Карточка консультации: клиент Анна, 7 ноября в 15:00, стоимость 3 000 рублей.',
    description:
      'Открыли карточку — вспомнили, о чём договорились и когда состоится заказ.',
  },
  {
    key: 'contact',
    title: 'Знайте, что делать дальше',
    text: 'Запланируйте следующий контакт и сохраните, о чём нужно поговорить.',
    label: 'Следующий контакт',
    alt: 'Задача: уточнить задачу Анны, обсудить вопросы и подтвердить время.',
    description:
      'Запишите следующий шаг: кому позвонить, когда и что нужно уточнить.',
  },
  {
    key: 'payments',
    title: 'Видите, сколько осталось',
    text: 'Отмечайте полученные деньги и контролируйте остаток по заказу.',
    label: 'Оплаты по заказу',
    alt: 'Стоимость консультации 3 000 рублей. Получено 1 000 рублей, осталось 2 000 рублей.',
    description:
      'Общая сумма — 3 000 ₽. Получено — 1 000 ₽. Сразу видно, сколько осталось оплатить.',
  },
]

export default function HomeFeaturePreview() {
  const [selected, setSelected] = useState('order')
  const example = examples.find((item) => item.key === selected)
  return (
    <div className={styles['feature-layout']}>
      <div
        className={styles['feature-buttons']}
        role="group"
        aria-label="Посмотреть возможности на учебном примере"
      >
        {examples.map((item, index) => (
          <button
            key={item.key}
            type="button"
            className={styles['feature-button']}
            aria-pressed={selected === item.key}
            aria-controls="home-product-proof"
            onClick={() => setSelected(item.key)}
          >
            <span className={styles.number} aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span>
              <strong>{item.title}</strong>
              <span className={styles.description}>{item.text}</span>
            </span>
            <svg
              className={styles.arrow}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                d="M4 12h15M13 5l7 7-7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ))}
      </div>
      <div id="home-product-proof" className={styles.proof}>
        <div className={styles['proof-top']}>
          <span>{example.label}</span>
          <span>Учебный пример</span>
        </div>
        <div className={styles['proof-window']}>
          <Image
            src={`/marketing/home/v5/${example.key}.png`}
            data-kind={example.key}
            alt={example.alt}
            width={864}
            height={1080}
            unoptimized
          />
        </div>
        <p className={styles['proof-description']} aria-live="polite">
          {example.description}
        </p>
      </div>
    </div>
  )
}
