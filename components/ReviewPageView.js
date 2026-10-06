import cn from 'classnames'
import styles from './ReviewPageView.module.css'

export const REVIEW_COMMENT_LIMIT = 2000
export const REVIEW_ACCENT_VALUES = [
  'sand',
  'terracotta',
  'emerald',
  'sky',
  'violet',
]
export const REVIEW_COVER_VALUES = ['plain', 'warm', 'deep']

const StarIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M12 2.7l2.86 5.8 6.4.93-4.63 4.51 1.09 6.37L12 17.3l-5.72 3.01 1.09-6.37L2.74 9.43l6.4-.93L12 2.7z"
    />
  </svg>
)

const FormFields = ({
  appearance,
  performerName,
  dateText,
  rating,
  comment,
  onRatingChange,
  onCommentChange,
  busy,
  preview,
  error,
}) => {
  const commentTooLong = comment.length > REVIEW_COMMENT_LIMIT
  const canSubmit = Boolean(rating) && !busy && !commentTooLong
  return (
    <>
      {appearance?.greeting ? (
        <p className={styles.greeting}>{appearance.greeting}</p>
      ) : null}
      <p className={styles.intro}>
        Оцените работу: <strong>{performerName}</strong>
      </p>
      {dateText ? <p className={styles.date}>Дата работы: {dateText}</p> : null}
      <fieldset className={styles.ratingField} disabled={busy}>
        <legend className={styles.ratingLegend}>Ваша оценка</legend>
        <div className={styles.stars}>
          {[1, 2, 3, 4, 5].map((value) => (
            <label
              key={value}
              className={cn(styles.star, value <= rating && styles.starActive)}
            >
              <input
                className={styles.starInput}
                type="radio"
                name="rating"
                value={value}
                checked={rating === value}
                onChange={() => onRatingChange?.(value)}
                aria-label={`${value} из 5`}
                required
              />
              <StarIcon />
            </label>
          ))}
        </div>
        <p className={styles.ratingNote} aria-live="polite">
          {rating ? `${rating} из 5` : 'Выберите от 1 до 5 звёзд'}
        </p>
      </fieldset>
      <div>
        <label className={styles.fieldLabel} htmlFor="review-comment">
          Что понравилось или что можно улучшить?
        </label>
        <textarea
          id="review-comment"
          className={cn(styles.comment, commentTooLong && styles.commentError)}
          aria-label="Комментарий"
          value={comment}
          rows={4}
          onChange={(event) => onCommentChange?.(event.target.value)}
        />
        {commentTooLong ? (
          <p className={styles.fieldError}>
            Не более {REVIEW_COMMENT_LIMIT} символов
          </p>
        ) : (
          <p className={styles.hint}>
            Комментарий необязателен · {comment.length}/{REVIEW_COMMENT_LIMIT}
          </p>
        )}
      </div>
      {error ? (
        <p className={styles.alert} role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        className={styles.submit}
        disabled={preview ? true : !canSubmit}
        aria-busy={busy}
        title={
          preview
            ? 'Предпросмотр: на реальной странице кнопка отправит отзыв'
            : undefined
        }
      >
        {busy ? 'Отправляем…' : 'Отправить отзыв'}
      </button>
      <p className={styles.privacy}>
        Отзыв увидит исполнитель. Он не будет опубликован автоматически.
      </p>
    </>
  )
}

// Общий вид публичной страницы отзыва. Используется и на /review/[id],
// и в живом предпросмотре настроек (preview=true).
const ReviewPageView = ({
  appearance = null,
  state = 'form',
  error = '',
  performerName = '',
  eventDate = null,
  rating = 0,
  comment = '',
  onRatingChange,
  onCommentChange,
  onSubmit,
  onRetry,
  busy = false,
  preview = false,
  scheme,
}) => {
  const accent = REVIEW_ACCENT_VALUES.includes(appearance?.accent)
    ? appearance.accent
    : REVIEW_ACCENT_VALUES[0]
  const cover = REVIEW_COVER_VALUES.includes(appearance?.cover)
    ? appearance.cover
    : REVIEW_COVER_VALUES[0]
  const dateText = eventDate
    ? new Date(eventDate).toLocaleDateString('ru-RU')
    : ''
  const FormTag = preview ? 'div' : 'form'

  return (
    <div
      className={styles.page}
      data-accent={accent}
      data-cover={cover}
      data-scheme={scheme}
      data-preview={preview ? 'true' : undefined}
      data-busy={busy ? 'true' : undefined}
    >
      <div className={styles.shell}>
        <header className={styles.cover}>
          {appearance?.logoUrl ? (
            // Публичная страница вне кабинета: обычный img без оптимизатора.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.logo}
              src={appearance.logoUrl}
              alt=""
              loading="lazy"
            />
          ) : null}
          {!appearance ? (
            <>
              <div className={styles.brandMark} aria-hidden="true">
                В
              </div>
              <h1 className={styles.eyebrow}>Ведело · Отзыв о работе</h1>
            </>
          ) : (
            <>
              <p className={styles.eyebrow}>Отзыв о работе</p>
              <h1 className={styles.name}>{appearance.publicName}</h1>
              {appearance.specialization ? (
                <p className={styles.specialization}>
                  {appearance.specialization}
                </p>
              ) : null}
            </>
          )}
        </header>
        <main className={styles.main}>
          {state === 'form' ? (
            <FormTag className={styles.card} onSubmit={preview ? undefined : onSubmit}>
              <FormFields
                appearance={appearance}
                performerName={performerName}
                dateText={dateText}
                rating={rating}
                comment={comment}
                onRatingChange={onRatingChange}
                onCommentChange={onCommentChange}
                busy={busy}
                preview={preview}
                error={error}
              />
            </FormTag>
          ) : (
            <div className={styles.card}>
              {state === 'loading' ? (
                <>
                  <h1 className={styles.thanksTitle}>Отзыв о работе</h1>
                  <p className={styles.status} role="status">
                    Загружаем приглашение…
                  </p>
                </>
              ) : null}
              {state === 'error' ? (
                <>
                  <h1 className={styles.thanksTitle}>Отзыв о работе</h1>
                  <p className={styles.alert} role="alert">
                    {error}
                  </p>
                  {onRetry ? (
                    <button
                      type="button"
                      className={styles.retry}
                      onClick={onRetry}
                    >
                      Повторить
                    </button>
                  ) : null}
                </>
              ) : null}
              {state === 'thanks' ? (
                <div className={styles.thanks}>
                  <div className={styles.checkCircle} aria-hidden="true">
                    ✓
                  </div>
                  <h1 className={styles.thanksTitle}>Спасибо за отзыв!</h1>
                  <p className={styles.thanksText}>
                    Ваш отзыв передан исполнителю. Он не будет опубликован
                    автоматически.
                  </p>
                </div>
              ) : null}
            </div>
          )}
          <footer className={styles.footer}>
            <span>
              Работает на{' '}
              <a href="https://vedelo.ru" target="_blank" rel="noreferrer">
                Ведело
              </a>
            </span>
            <span>CRM для малого бизнеса и частных специалистов</span>
          </footer>
        </main>
      </div>
    </div>
  )
}

export default ReviewPageView
