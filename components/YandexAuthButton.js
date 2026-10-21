import Image from 'next/image'

export default function YandexAuthButton({ href, children = 'Войти с Яндекс ID' }) {
  return (
    <a className="yandex-auth-button" href={href}>
      <Image
        className="yandex-auth-button-logo"
        src="/icons/yandex-id-original.png"
        width={28}
        height={28}
        alt=""
        unoptimized
      />
      <span>{children}</span>
    </a>
  )
}
