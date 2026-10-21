export default function YandexAuthButton({ href, children = 'Войти с Яндекс ID' }) {
  return (
    <a className="yandex-auth-button" href={href}>
      <span className="yandex-auth-button-logo" aria-hidden="true">Я</span>
      <span>{children}</span>
    </a>
  )
}
