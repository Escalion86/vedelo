'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAtomValue } from 'jotai'
import { AnimatePresence, motion } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBars,
  faCalendarCheck,
  faChevronRight,
  faClock,
  faExclamationCircle,
  faUser,
} from '@fortawesome/free-solid-svg-icons'
import AddIcon from '@mui/icons-material/Add'
import cn from 'classnames'
import { pages, pagesGroups } from '@helpers/constants'
import isPageAllowedForRole from '@helpers/pageAccess'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import windowDimensionsTailwindSelector from '@state/selectors/windowDimensionsTailwindSelector'
import { additionalEventsOverdueCountAtom } from '@state/selectors/additionalEventsOverdueCountAtom'
import { useSupportSummaryQuery } from '@helpers/useSupportTickets'
import useEventCreateMenu from '@helpers/useEventCreateMenu'
import useWorkItemTerminology from '@helpers/useWorkItemTerminology'

const EVENTS_PAGES = ['events', 'eventsUpcoming', 'eventsPast']
const ATTENTION_PAGE = 'attention'
const CLIENTS_PAGES = ['clients']

// Разделы, которые уже вынесены в нижнюю панель, — в «Меню» не дублируются
const BOTTOM_NAV_PAGES = [...EVENTS_PAGES, ATTENTION_PAGE, ...CLIENTS_PAGES]

// Порядок групп в шторке «Меню»: «Настройки» — непосредственно над
// «Настройками сайта», остальные — в порядке pagesGroups
const MENU_SHEET_GROUP_ORDER = [4, 11, 7, 5, 8, 9, 6, 10, 12, 99]

// Группы «Меню» с несколькими пунктами сворачиваются в аккордеон
const COLLAPSIBLE_GROUP_MIN_ITEMS = 2

const EVENTS_SUBMENU = [
  { key: 'eventsUpcoming', label: 'Предстоящие', icon: faCalendarCheck },
  { key: 'eventsPast', label: 'Прошедшие', icon: faClock },
]

const buildMenuSheetGroups = (role, workItemTerms) =>
  pagesGroups
    .reduce((acc, group) => {
      const items = pages.filter(
        (page) =>
          page.group === group.id &&
          !BOTTOM_NAV_PAGES.includes(page.href) &&
          isPageAllowedForRole(page.accessRoles, role)
      )
      if (items.length > 0)
        acc.push({
          id: group.id,
          name:
            group.id === 2 ? workItemTerms.pluralCapitalized : group.name,
          icon: group.icon,
          items,
        })
      return acc
    }, [])
    .sort((a, b) => {
      const orderOf = (id) => {
        const idx = MENU_SHEET_GROUP_ORDER.indexOf(id)
        return idx === -1 ? MENU_SHEET_GROUP_ORDER.length : idx
      }
      return orderOf(a.id) - orderOf(b.id)
    })

const MenuRow = ({ icon, label, current, badge, onClick, className }) => (
  <button
    type="button"
    role="menuitem"
    aria-current={current ? 'page' : undefined}
    className={cn(
      'mobile-bottomnav-submenu-row',
      current && 'current',
      className
    )}
    onClick={onClick}
  >
    <FontAwesomeIcon icon={icon} className="h-4 w-4 shrink-0" />
    <span className="truncate">{label}</span>
    {badge > 0 ? (
      <span className="mobile-bottomnav-row-badge">
        {badge > 99 ? '99+' : badge}
      </span>
    ) : null}
  </button>
)

const SubMenu = ({ items, currentPage, onNavigate, className }) => (
  <motion.div
    initial={{ opacity: 0, y: 10, scale: 0.97 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: 8, scale: 0.97 }}
    transition={{ duration: 0.16, ease: 'easeOut' }}
    className={cn(
      'ui-surface-card absolute bottom-[calc(100%+10px)] w-56 rounded-xl p-1.5',
      className
    )}
    role="menu"
  >
    {items.map((item) => (
      <MenuRow
        key={item.key}
        icon={item.icon}
        label={item.label}
        current={currentPage === item.key}
        onClick={() => onNavigate(item.key)}
      />
    ))}
  </motion.div>
)

const BarItem = ({ icon, label, active, badge, onClick, ariaLabel }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={ariaLabel || label}
    aria-current={active ? 'page' : undefined}
    className={cn('mobile-bottomnav-item', active && 'active')}
  >
    <span className="relative flex">
      <FontAwesomeIcon icon={icon} className="mobile-bottomnav-ico" />
      {badge > 0 ? (
        <span className="mobile-bottomnav-badge">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </span>
    <span className="mobile-bottomnav-label">{label}</span>
  </button>
)

/**
 * Нижняя навигация кабинета для телефонов (phoneV/phoneH).
 * Слоты: Важное / Мероприятия / [+] / Клиенты / Меню.
 * «Важное» ведёт на страницу задач и событий, требующих внимания (бейдж —
 * число просроченных), «Мероприятия» открывает подменю раздела,
 * «Клиенты» ведёт сразу на список клиентов (события клиентов — в разделе
 * «Важное»), «+» — меню создания, «Меню» — панель остальных разделов (без
 * дублей нижней панели), крупные группы в ней сворачиваются в аккордеон.
 * Занимает отдельный ряд сетки CabinetWrapper, поэтому контент не перекрывается.
 */
const MobileBottomNav = () => {
  const router = useRouter()
  const pathname = usePathname()
  const device = useAtomValue(windowDimensionsTailwindSelector)
  const loggedUser = useAtomValue(loggedUserAtom)
  const overdueCount = useAtomValue(additionalEventsOverdueCountAtom)
  const supportSummary = useSupportSummaryQuery()
  const { items: createItems, draftModals } = useEventCreateMenu()
  const workItemTerms = useWorkItemTerminology()
  const [openPanel, setOpenPanel] = useState(null)
  const [expandedGroups, setExpandedGroups] = useState({})
  const [lastPathname, setLastPathname] = useState(pathname)

  const isPhone = device === 'phoneV' || device === 'phoneH'
  const currentPage = pathname?.split('/').filter(Boolean)?.[1] || ''
  const role = loggedUser?.role ?? 'user'
  const feedbackUnread = Number(supportSummary.data?.data?.unreadCount || 0)

  const menuSheetGroups = useMemo(
    () => buildMenuSheetGroups(role, workItemTerms),
    [role, workItemTerms]
  )

  // Закрываем открытые подменю при смене страницы (в т.ч. по кнопке «назад»)
  if (pathname !== lastPathname) {
    setLastPathname(pathname)
    setOpenPanel(null)
  }

  const closePanel = useCallback(() => setOpenPanel(null), [])
  const togglePanel = useCallback(
    (panel) => setOpenPanel((prev) => (prev === panel ? null : panel)),
    []
  )
  const toggleGroup = useCallback(
    (groupId) =>
      setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] })),
    []
  )

  const navigate = useCallback(
    (href) => {
      setOpenPanel(null)
      router.push(`/cabinet/${href}`)
    },
    [router]
  )

  useEffect(() => {
    if (!openPanel) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpenPanel(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [openPanel])

  useEffect(() => {
    ;[
      'attention',
      'eventsUpcoming',
      'eventsPast',
      'clients',
      'transactions',
    ].forEach((href) => router.prefetch(`/cabinet/${href}`))
  }, [router])

  if (!isPhone) return null

  const eventsActive = EVENTS_PAGES.includes(currentPage)
  const attentionActive = currentPage === ATTENTION_PAGE
  const clientsActive = CLIENTS_PAGES.includes(currentPage)
  const createOpen = openPanel === 'create'

  return (
    <>
      {draftModals}
      {openPanel ? (
        <div
          className="fixed inset-0 z-40 bg-gray-800/40"
          aria-hidden="true"
          onClick={closePanel}
        />
      ) : null}
      <nav
        className="mobile-bottomnav"
        style={{ gridArea: 'bottomnav' }}
        aria-label="Основная навигация"
      >
        <AnimatePresence>
          {openPanel === 'events' ? (
            <SubMenu
              key="submenu-events"
              items={EVENTS_SUBMENU}
              currentPage={currentPage}
              onNavigate={navigate}
              className="left-14"
            />
          ) : null}
          {openPanel === 'menu' ? (
            <motion.div
              key="menu-sheet"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="ui-surface-card mobile-bottomnav-sheet absolute right-2 bottom-[calc(100%+8px)] left-2 overflow-y-auto rounded-2xl p-1.5"
              role="menu"
              aria-label="Все разделы"
            >
              {menuSheetGroups.map((group) => {
                const collapsible =
                  group.items.length >= COLLAPSIBLE_GROUP_MIN_ITEMS
                const expanded = expandedGroups[group.id] ?? !collapsible
                return (
                  <div key={group.id}>
                    {collapsible ? (
                      <button
                        type="button"
                        aria-expanded={expanded}
                        className={cn(
                          'mobile-bottomnav-submenu-row mobile-bottomnav-sheet-toggle',
                          expanded && 'expanded'
                        )}
                        onClick={() => toggleGroup(group.id)}
                      >
                        {group.icon ? (
                          <FontAwesomeIcon
                            icon={group.icon}
                            className="h-4 w-4 shrink-0"
                          />
                        ) : null}
                        <span className="truncate">{group.name}</span>
                        <FontAwesomeIcon
                          icon={faChevronRight}
                          className="mobile-bottomnav-sheet-chevron"
                        />
                      </button>
                    ) : null}
                    {expanded
                      ? group.items.map((item) => (
                          <MenuRow
                            key={item.href}
                            icon={item.icon}
                            label={item.name}
                            current={currentPage === item.href}
                            badge={item.href === 'feedback' ? feedbackUnread : 0}
                            onClick={() => navigate(item.href)}
                            className={
                              collapsible
                                ? 'mobile-bottomnav-submenu-row--sub'
                                : undefined
                            }
                          />
                        ))
                      : null}
                  </div>
                )
              })}
            </motion.div>
          ) : null}
          {createOpen ? (
            <div
              key="create-menu"
              className="absolute bottom-[calc(100%+12px)] left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2"
            >
              <motion.p
                initial={{ opacity: 0, y: 12, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                className="px-3 py-1 text-sm font-semibold whitespace-nowrap text-[#ebd3a5] [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]"
              >
                {`Создать ${workItemTerms.accusative}`}
              </motion.p>
              {createItems.map((item, index) => (
                <motion.button
                  key={item.key}
                  type="button"
                  initial={{ opacity: 0, y: 12, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{
                    duration: 0.16,
                    delay: index * 0.03,
                    ease: 'easeOut',
                  }}
                  className="ui-surface-card mobile-bottomnav-create-item flex min-h-11 cursor-pointer items-center gap-2.5 rounded-full py-2.5 pr-5 pl-4 text-sm font-semibold whitespace-nowrap"
                  onClick={() => {
                    setOpenPanel(null)
                    item.onClick?.()
                  }}
                >
                  <span className="flex h-5 w-5 items-center justify-center text-[var(--ui-primary)]">
                    {item.icon}
                  </span>
                  {item.label}
                </motion.button>
              ))}
            </div>
          ) : null}
        </AnimatePresence>

        <BarItem
          icon={faExclamationCircle}
          label="Важное"
          active={attentionActive}
          badge={overdueCount}
          onClick={() => navigate(ATTENTION_PAGE)}
          ariaLabel="Важное: задачи и события, требующие внимания"
        />
        <BarItem
          icon={faCalendarCheck}
          label={workItemTerms.pluralCapitalized}
          active={eventsActive}
          onClick={() => togglePanel('events')}
          ariaLabel={`${workItemTerms.pluralCapitalized}: предстоящие и прошедшие`}
        />
        <div className="relative flex flex-1 items-start justify-center">
          <motion.button
            type="button"
            aria-label={`Добавить заявку или ${workItemTerms.accusative}`}
            aria-expanded={createOpen}
            title={`Добавить заявку или ${workItemTerms.accusative}`}
            animate={{ rotate: createOpen ? 45 : 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="mobile-bottomnav-fab"
            onClick={() => togglePanel('create')}
          >
            <AddIcon style={{ fontSize: 30 }} />
          </motion.button>
        </div>
        <BarItem
          icon={faUser}
          label="Клиенты"
          active={clientsActive}
          onClick={() => navigate('clients')}
          ariaLabel="Клиенты: список клиентов"
        />
        <BarItem
          icon={faBars}
          label="Меню"
          active={openPanel === 'menu'}
          onClick={() => togglePanel('menu')}
          ariaLabel="Все разделы"
        />
      </nav>
    </>
  )
}

export default MobileBottomNav
