/* eslint-disable @next/next/no-img-element */
import Burger from '@components/Burger'
import { faSignInAlt } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import menuOpenAtom from '@state/atoms/menuOpen'
import filteredEventsSelector from '@state/selectors/filteredEventsSelector'
import cn from 'classnames'
import Link from 'next/link'
import { useAtomValue, useSetAtom } from 'jotai'
import Avatar from './Avatar'
import UserMenu from './UserMenu'
import filteredServicesSelector from '@state/selectors/filteredServicesSelector'

const MenuItem = ({ text, href = '#' }) => (
  <li>
    <a
      href={href}
      className="cursor-pointer first-letter:uppercase text-general hover:text-gray-300"
    >
      <p className="first-letter:uppercase whitespace-nowrap">{text}</p>
    </a>
  </li>
)

const BurgerMenuItem = ({ text, href = '#' }) => {
  const setMenuOpen = useSetAtom(menuOpenAtom)
  return (
    <li className="flex flex-1">
      <a
        href={href}
        className="flex-1 px-2 py-1 text-2xl duration-300 rounded cursor-pointer whitespace-nowrap hover:bg-general hover:text-white"
        onClick={() => setMenuOpen(false)}
      >
        {text}
      </a>
    </li>
  )
}


const Header = ({ noMenu }) => {
  const loggedUser = useAtomValue(loggedUserAtom)
  const events = useAtomValue(filteredEventsSelector)
  const services = useAtomValue(filteredServicesSelector)

  const menu = [{ name: 'Наши цели', href: '/#about' }]
  // if (events?.length > 0)
  menu.push({ name: 'Заказы', href: '/#events' })
  if (services?.length > 0) menu.push({ name: 'Услуги', href: '/#services' })
  menu.push({ name: 'Контакты', href: '/#contacts' })

  // const filteredMenu = menu.filter(
  //   (menuItem) =>
  //     !menuItem.key || (props[menuItem.key] && props[menuItem.key].length > 0)
  // )

  const menuOpen = useAtomValue(menuOpenAtom)
  return (
    // <div className="w-full h-18">
    <div className="sticky top-0 left-0 right-0 z-20 flex flex-col items-center justify-between shadow-md h-18 min-h-[4.5rem]">
      {/* <Header user={user} /> */}
      <div className="z-10 flex items-center justify-end w-full px-2 py-1 laptop:px-4 h-18 min-h-[4.5rem] bg-general">
        <div className="flex-1 laptop:hidden ">
          <Burger />
        </div>
        <div className="absolute z-10 -translate-x-1/2 left-1/2">
          <Link href="/" shallow>
            <img
              className="object-contain h-16 laptop:min-w-min"
              src={'/img/logo_horizontal.png'}
              alt="Ведело"
              // width={48}
              // height={48}
            />
          </Link>
        </div>

        <UserMenu />
      </div>
      {!noMenu && (
        <>
          <ul className="items-center justify-center hidden w-full h-[40px] text-lg duration-300 bg-white bg-opacity-75 laptop:flex gap-x-4 hover:bg-opacity-100">
            {menu.map(({ name, href }, index) => {
              return (
                <MenuItem key={'menuItem' + name} text={name} href={href} />
              )
            })}
          </ul>
          <div
            className={cn(
              'overflow-hidden laptop:hidden absolute z-0 left-0 top-0 bg-white rounded-br-3xl border-r border-b shadow-2xl border-general duration-300',
              menuOpen ? 'w-60' : 'w-0'
            )}
          >
            <div className="pt-20 pb-4 w-60">
              <div className="flex w-full px-2 pb-2 border-b laptop:hidden border-general">
                {loggedUser?._id ? (
                  <Link
                    href="/cabinet"
                    shallow
                    className="flex items-center w-full px-1 py-1 text-lg rounded-lg hover:text-white gap-x-2 hover:bg-general"
                  >
                    <Avatar user={loggedUser} />
                    <span className="prevent-select-text">Мой кабинет</span>
                  </Link>
                ) : (
                  <Link
                    href="/login"
                    shallow
                    className="flex items-center w-full px-2 py-2 text-lg text-center border border-white rounded-lg gap-x-2 flexpx-2 text-general laptop:px-3 hover:text-white hover:bg-general"
                  >
                    <FontAwesomeIcon icon={faSignInAlt} className="w-6 h-6" />
                    <span className="prevent-select-text">Авторизоваться</span>
                  </Link>
                )}
              </div>
              <div className="px-2 py-2 w-60 laptop:py-0">
                <ul className="flex flex-col gap-y-2">
                  {menu.map(({ name, href }, index) => (
                    <BurgerMenuItem
                      key={'burgerMenuItem' + index}
                      text={name}
                      href={href}
                    />
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
    // </div>
  )
}

export default Header

