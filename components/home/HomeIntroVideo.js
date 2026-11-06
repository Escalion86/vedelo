'use client'

import Image from 'next/image'
import { useRef, useState } from 'react'
import Notice from '@components/Notice'
import styles from './HomeLanding.module.css'

const videoUrl = '/marketing/home/v5/vedelo-home-720p.mp4'
const posterUrl = '/marketing/home/v5/author.jpg'

export default function HomeIntroVideo() {
  const videoRef = useRef(null)
  const startingRef = useRef(false)
  const [started, setStarted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const play = async () => {
    if (startingRef.current) return
    const video = videoRef.current
    startingRef.current = true
    setLoading(true)
    setFailed(false)
    try {
      // Set the source only after a deliberate click, including on mobile Safari.
      if (!video.getAttribute('src')) video.src = videoUrl
      else if (video.error) video.load()
      await video.play()
      video.controls = true
      setStarted(true)
      video.focus()
    } catch {
      setFailed(true)
    } finally {
      startingRef.current = false
      setLoading(false)
    }
  }

  return (
    <div>
      <div className={styles['video-shell']}>
        <video
          ref={videoRef}
          id="home-intro-video"
          playsInline
          preload="none"
          poster={posterUrl}
          tabIndex={started ? 0 : -1}
          onError={() => {
            setFailed(true)
            setLoading(false)
          }}
          aria-label="Алексей рассказывает о Ведело. Русские субтитры вшиты в изображение."
        />
        {!started ? (
          <button
            type="button"
            className={styles['video-cover']}
            onClick={play}
            disabled={loading}
            aria-busy={loading}
            aria-controls="home-intro-video"
            aria-label={
              failed
                ? 'Повторить запуск видео'
                : 'Смотреть рассказ автора о Ведело, 1 минута 54 секунды'
            }
          >
            <Image
              src={posterUrl}
              alt="Алексей, основатель Ведело"
              width={1280}
              height={720}
              preload
              unoptimized
            />
            <span className={styles['play-label']}>
              <span className={styles['play-icon']}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m8 4 12 8-12 8Z" fill="currentColor" />
                </svg>
              </span>
              <span className={styles['play-words']}>
                <strong>
                  {loading
                    ? 'Загружаем видео…'
                    : failed
                      ? 'Повторить просмотр'
                      : 'Почему я создал Ведело'}
                </strong>
                <small>Рассказ автора · 1:54</small>
              </span>
            </span>
          </button>
        ) : null}
      </div>
      <div className={styles['video-caption']}>
        <div>
          <strong>Алексей, основатель Ведело</strong>
          <p>Более 20 лет в сфере услуг</p>
        </div>
        <span className={styles['video-note']}>Можно смотреть без звука</span>
      </div>
      {failed ? (
        <div className={styles['video-error']} role="status">
          <Notice tone="warning">
            Не удалось запустить видео. Попробуйте ещё раз или{' '}
            <a href={videoUrl}>откройте отдельным файлом</a>.
          </Notice>
        </div>
      ) : null}
      <noscript>
        <p>
          <a href={videoUrl}>Смотреть рассказ автора о Ведело</a>
        </p>
      </noscript>
    </div>
  )
}
