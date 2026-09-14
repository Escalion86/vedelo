/* eslint-disable react-hooks/exhaustive-deps */
import { faAngleDown } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { pages, pagesGroups } from '@helpers/constants'
import isPageAllowedForRole from '@helpers/pageAccess'
import menuOpenAtom from '@state/atoms/menuOpen'
import windowDimensionsTailwindSelector from '@state/selectors/windowDimensionsTailwindSelector'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
// import badgesSelector from '@state/selectors/badgesSelector'
import cn from 'classnames'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAtom, useAtomValue } from 'jotai'
import { additionalEventsOverdueCountAtom } from '@state/selectors/additionalEventsOverdueCountAtom'
import ImpersonationReturnButton from '@components/ImpersonationReturnButton'
import { useSupportSummaryQuery } from '@helpers/useSupportTickets'
import useWorkItemTerminology from '@helpers/useWorkItemTerminology'

const menuCfg = (role, workItemTerms) => {
  // const visiblePages = pages.filter((page) => )

  const result = pagesGroups
    // .filter(
    //   (pageGroup) =>
    //     // (!disabledGroupsIds ||
    //     //   typeof disabledGroupsIds !== 'object' ||
    //     //   !disabledGroupsIds.includes(pageGroup.id)) &&
    //     pageGroup.accessRoles.includes(userActiveRole) &&
    //     (!pageGroup.accessStatuses ||
    //       pageGroup.accessStatuses.includes(userActiveStatus))
    // )
    .reduce((totalGroups, group) => {
      const pagesItems = pages.reduce((totalPages, page) => {
        if (
          page.group === group.id &&
          isPageAllowedForRole(page.accessRoles, role)
          //  &&
          // page.roleAccess(userActiveRole, userActiveStatusName)
          // page.accessRoles.includes(userActiveRole) &&
          // (!page.accessStatuses ||
          //   page.accessStatuses.includes(userActiveStatus))
        ) {
          totalPages.push(page)
          // if (user.access && page.variable && user.access[page.variable]) {
          //   if (user.access[page.variable].page) totalPages.push(page)
          //   return totalPages
          // } else {
          //   if (user.access && user.access['other'].page) totalPages.push(page)
          //   return totalPages
          // }
        }
        return totalPages
      }, [])
      if (pagesItems.length > 0)
        totalGroups.push({
          name:
            group.id === 2 ? workItemTerms.pluralCapitalized : group.name,
          icon: group.icon,
          items: pagesItems,
          bottom: group.bottom,
          id: group.id,
        })
      return totalGroups
    }, [])
  return result
}

const MenuItem = ({
  item,
  active = false,
  badge,
  pending = false,
  onNavigate,
}) => {
  return (
    <Link
      href={`/cabinet/${item.href}`}
      onClick={() => onNavigate?.(item.href)}
      className={cn(
        'mb-1 flex cursor-pointer flex-nowrap items-center justify-between rounded-lg transition-opacity',
        active ? 'bg-general menu-item-active text-white' : '',
        pending ? 'opacity-70' : '',
        'hover:bg-general hover:text-white'
      )}
    >
      <div className={cn('flex w-full items-center gap-x-2 px-3 py-1')}>
        <FontAwesomeIcon icon={item.icon} className="h-5 w-5 min-w-5" />
        <span className={'text-sm font-medium whitespace-nowrap'}>
          {item.name}
        </span>
        {item.num !== null && (
          <span className="text-general text-xs font-semibold">{item.num}</span>
        )}
        {typeof badge === 'number' && badge > 0 && (
          <div className="bg-danger flex h-5 min-h-5 w-5 min-w-5 items-center justify-center rounded-full text-xs text-white">
            {badge <= 99 ? badge : '!'}
          </div>
        )}
        {pending && (
          <span className="ml-auto h-2 min-h-2 w-2 min-w-2 animate-pulse rounded-full bg-white/80" />
        )}
      </div>
    </Link>
  )
}

const Menu = ({
  menuCfg,
  activePage,
  pendingPage,
  onNavigate,
  pageBadges,
  impersonationActive,
}) => {
  const [menuOpen, setMenuOpen] = useAtom(menuOpenAtom)
  const [openedMenuIndex, setOpenedMenuIndex] = useState(1)

  // const { itemsBadges, groupsBadges } = useAtomValue(badgesSelector)

  const variants = {
    show: { height: 'auto' },
    hide: { height: 0 },
  }

  useEffect(() => {
    if (!menuOpen) setOpenedMenuIndex(null)
  }, [menuOpen])

  const indexOfActiveGroup = menuCfg.findIndex((item) =>
    item.items.find((item) => item.href === activePage)
  )
  return (
    <nav className="mt-1 flex h-full w-full flex-col gap-y-2 px-2 py-3">
      {menuCfg &&
        menuCfg.length > 0 &&
        menuCfg
          // .filter(({ items }) => {
          //   console.log('items :>> ', items)
          //   return true
          // })
          .map((item, index) => {
            const groupIsActive = index === indexOfActiveGroup
            const isSingleItem = item.items.length === 1
            return (
              <div
                className={cn('z-50 flex flex-col', {
                  'flex-1': item.bottom && !menuCfg[index - 1].bottom,
                })}
                key={index}
              >
                {item.bottom && !menuCfg[index - 1].bottom && (
                  <div className="flex-1" />
                )}
                <div
                  className={cn(
                    'group min-w-12 rounded-lg duration-300',
                    groupIsActive ? 'text-general bg-white' : 'text-white'
                    // : 'hover:text-general text-white hover:bg-white'
                  )}
                  key={'groupMenu' + index}
                >
                  {isSingleItem ? (
                    <Link
                      href={`/cabinet/${item.items[0].href}`}
                      className={cn(
                        'flex min-h-12 w-full min-w-12 items-center gap-x-2 overflow-hidden px-2 py-2 transition-opacity',
                        pendingPage === item.items[0].href ? 'opacity-70' : ''
                        // groupIsActive ? 'text-ganeral' : 'text-white'
                      )}
                      onClick={() => {
                        onNavigate?.(item.items[0].href)
                      }}
                    >
                      <div
                        className={cn(
                          'relative flex max-h-8 min-h-8 max-w-8 min-w-8 justify-center'
                          // groupIsActive ? 'text-ganeral' : 'text-white'
                        )}
                      >
                        <FontAwesomeIcon icon={item.icon} size="2x" />
                        {typeof pageBadges?.[item.items[0].href] === 'number' &&
                          pageBadges[item.items[0].href] > 0 && (
                            <div className="bg-danger absolute -top-1 -right-2 flex h-5 min-h-5 w-5 min-w-5 items-center justify-center rounded-full text-xs text-white">
                              {pageBadges[item.items[0].href] <= 99
                                ? pageBadges[item.items[0].href]
                                : '99+'}
                            </div>
                          )}
                      </div>
                      <h3 className="ml-3 flex-1 text-left font-semibold tracking-wide whitespace-nowrap uppercase">
                        {item.items[0].name}
                      </h3>
                      {pendingPage === item.items[0].href && (
                        <span className="h-2 min-h-2 w-2 min-w-2 animate-pulse rounded-full bg-current/80" />
                      )}
                    </Link>
                  ) : (
                    <button
                      className={cn(
                        'flex min-h-12 w-full min-w-12 items-center gap-x-2 overflow-hidden px-2 py-2'
                        // groupIsActive ? 'text-ganeral' : 'text-white'
                      )}
                      onClick={() => {
                        setOpenedMenuIndex(
                          openedMenuIndex === index ? null : index
                        )
                        setMenuOpen(true)
                      }}
                    >
                      <div
                        className={cn(
                          'relative flex max-h-8 min-h-8 max-w-8 min-w-8 justify-center'
                          // groupIsActive ? 'text-ganeral' : 'text-white'
                        )}
                      >
                        <FontAwesomeIcon icon={item.icon} size="2x" />
                        {/* {item.items.length > 1 &&
                          typeof groupsBadges[item.id] === 'number' &&
                          groupsBadges[item.id] > 0 && (
                            <div className="absolute flex items-center justify-center w-5 h-5 text-xs text-white rounded-full min-w-5 min-h-5 bg-danger -right-2 -top-1">
                              {groupsBadges[item.id] <= 99
                                ? groupsBadges[item.id]
                                : '!'}
                            </div>
                          )} */}
                      </div>
                      <h3 className="ml-3 flex-1 text-left font-semibold tracking-wide whitespace-nowrap uppercase">
                        {item.name}
                      </h3>
                      <div
                        className={cn('w-5 transition-transform duration-300', {
                          'rotate-180': openedMenuIndex === index,
                        })}
                      >
                        <FontAwesomeIcon icon={faAngleDown} size="lg" />
                      </div>
                    </button>
                  )}
                  {item.items.length > 1 && (
                    <motion.div
                      variants={variants}
                      initial="hide"
                      animate={openedMenuIndex === index ? 'show' : 'hide'}
                      className="mr-2 ml-3 overflow-hidden"
                    >
                      {item.items.map((subitem) => (
                        <MenuItem
                          key={'menu' + subitem.id}
                          item={subitem}
                          active={activePage === subitem.href}
                          pending={pendingPage === subitem.href}
                          onNavigate={onNavigate}
                          badge={pageBadges?.[subitem.href]}
                        />
                      ))}
                    </motion.div>
                  )}
                </div>
              </div>
            )
          })}
      {impersonationActive ? (
        <ImpersonationReturnButton onRestore={() => setMenuOpen(false)} />
      ) : null}
    </nav>
  )
}

const variants = {
  min: { width: '100%' },
  max: { width: 320 },
}

const mobileVariants = {
  min: { width: 0 },
  max: { width: '85vw' },
}

const SideBar = ({ page }) => {
  const router = useRouter()
  const pathname = usePathname()
  const wrapperRef = useRef(null)
  const menuRef = useRef(null)
  const [menuOpen, setMenuOpen] = useAtom(menuOpenAtom)
  const [pendingPage, setPendingPage] = useState(null)
  const device = useAtomValue(windowDimensionsTailwindSelector)
  const loggedUser = useAtomValue(loggedUserAtom)
  const overdueAdditionalCount = useAtomValue(additionalEventsOverdueCountAtom)
  const supportSummary = useSupportSummaryQuery()
  const workItemTerms = useWorkItemTerminology()
  const role = loggedUser?.role ?? 'user'
  const isMobile =
    device === 'phoneV' || device === 'phoneH' || device === 'tablet'
  const motionVariants = isMobile ? mobileVariants : variants
  const roleMenuCfg = menuCfg(role, workItemTerms)

  const handleNavigate = (href) => {
    setPendingPage(href)
    setMenuOpen(false)
  }

  useEffect(() => {
    /**
     * Alert if clicked on outside of element
     */
    function handleClickOutside(event) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target) &&
        !event.target.classList.contains('menu-btn') &&
        !event.target.classList.contains('menu-btn__burger')
      )
        setMenuOpen(false)
    }
    // Bind the event listener
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      // Unbind the event listener on clean up
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [wrapperRef])

  useEffect(() => {
    const pageFromPath = pathname?.split('/').filter(Boolean)?.[1]
    if (!pageFromPath) return
    if (!pendingPage || pendingPage === pageFromPath) setPendingPage(null)
  }, [pathname, pendingPage])

  useEffect(() => {
    roleMenuCfg.forEach((group) => {
      group.items.forEach((item) => {
        router.prefetch(`/cabinet/${item.href}`)
      })
    })
  }, [roleMenuCfg, router])

  return (
    <motion.div
      className={cn(
        'sidebar-root top-0 bottom-0 z-50 flex max-h-full flex-col',
        isMobile
          ? 'fixed top-16 bottom-0 left-0 max-h-[calc(100dvh-4rem)] max-w-[320px] min-w-0 overflow-hidden bg-transparent'
          : 'sidebar-bg tablet:w-16 tablet:min-w-16 relative w-0 min-w-16'
      )}
      // style={{ gridArea: 'sidebar' }}
      ref={wrapperRef}
      // style={{ width: 64 }}
      variants={mobileVariants}
      animate={isMobile ? (!menuOpen ? 'min' : 'max') : undefined}
      transition={{ duration: 0.5, type: 'tween' }}
      initial={isMobile ? 'min' : undefined}
    >
      <motion.div
        ref={menuRef}
        className={cn(
          'absolute top-0 z-10 h-full max-h-full w-full items-start overflow-hidden',
          isMobile ? 'sidebar-bg max-w-full shadow-2xl' : 'sidebar-bg'
        )}
        style={{ scrollBehavior: 'smooth' }}
        variants={motionVariants}
        animate={!menuOpen ? 'min' : 'max'}
        transition={{ duration: 0.5, type: 'tween' }}
        initial={'min'}
        layout
      >
        <div className="sidebar-scroll flex h-full w-full flex-col overflow-x-hidden overflow-y-auto">
          <Menu
            menuCfg={roleMenuCfg}
            activePage={page}
            pendingPage={pendingPage}
            onNavigate={handleNavigate}
            pageBadges={{
              attention: overdueAdditionalCount,
              feedback: supportSummary.data?.data?.unreadCount || 0,
            }}
            impersonationActive={loggedUser?.impersonation?.active === true}
          />
        </div>
      </motion.div>
      <motion.div
        variants={motionVariants}
        animate={!menuOpen ? 'min' : 'max'}
        transition={{ duration: 0.5, type: 'tween' }}
        initial={'min'}
        layout
        className={cn(
          'pointer-events-none absolute top-0 bottom-0',
          isMobile ? 'bg-transparent' : 'sidebar-bg'
        )}
      />
    </motion.div>
  )
}

export default SideBar
