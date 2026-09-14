'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import AddIcon from '@mui/icons-material/Add'
import { useAtomValue } from 'jotai'
import windowDimensionsTailwindSelector from '@state/selectors/windowDimensionsTailwindSelector'
import useWorkItemTerminology from '@helpers/useWorkItemTerminology'

/**
 * Плавающая кнопка создания (FAB) с выбором типа записи.
 * items: [{ key, label, icon, onClick }]
 * На телефонах (phoneV/phoneH) скрыта — создание вынесено в нижнюю навигацию.
 */
const CreateEventFab = ({ items = [], title }) => {
  const [open, setOpen] = useState(false)
  const device = useAtomValue(windowDimensionsTailwindSelector)
  const terms = useWorkItemTerminology()
  const resolvedTitle = title || `Добавить заявку или ${terms.accusative}`

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  if (!items.length) return null
  if (device === 'phoneV' || device === 'phoneH') return null

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-gray-800/40"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <div
        className="create-event-fab fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-end gap-2"
      >
        <AnimatePresence>
          {open
            ? items.map((item, index) => (
                <motion.button
                  key={item.key}
                  type="button"
                  initial={{ opacity: 0, y: 12, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{
                    duration: 0.16,
                    delay: open ? index * 0.03 : 0,
                    ease: 'easeOut',
                  }}
                  className="ui-surface-card flex min-h-11 cursor-pointer items-center gap-2.5 rounded-full py-2.5 pr-5 pl-4 text-sm font-semibold"
                  onClick={() => {
                    setOpen(false)
                    item.onClick?.()
                  }}
                >
                  <span className="flex h-5 w-5 items-center justify-center text-[var(--ui-primary)]">
                    {item.icon}
                  </span>
                  {item.label}
                </motion.button>
              ))
            : null}
        </AnimatePresence>
        <motion.button
          type="button"
          aria-label={resolvedTitle}
          aria-expanded={open}
          title={resolvedTitle}
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-[var(--ui-primary)] text-white shadow-lg transition-colors hover:bg-[var(--ui-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-primary)]"
          style={{
            boxShadow: '0 8px 24px rgba(23, 23, 20, 0.28)',
          }}
          onClick={() => setOpen((prev) => !prev)}
        >
          <AddIcon fontSize="large" />
        </motion.button>
      </div>
    </>
  )
}

export default CreateEventFab
