'use client'

import modalsAtom from '@state/atoms/modalsAtom'
import { useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useRef } from 'react'
import Modal from './Modal'

function ModalsPortal() {
  const modals = useAtomValue(modalsAtom)
  const setModals = useSetAtom(modalsAtom)
  const modalsRef = useRef(modals)
  const prevLengthRef = useRef(modals.length)
  const ignoreNextPopstateRef = useRef(false)
  const hasModals = modals.length > 0

  useEffect(() => {
    if (!hasModals) return

    // Блокируем pull-to-refresh даже при жесте из заголовка/футера.
    // Один замок на весь стек: закрытие вложенного окна не разблокирует фон.
    const properties = ['overflow', 'overscroll-behavior-y']
    const savedStyles = [document.documentElement, document.body].map(
      (element) => ({
        element,
        values: properties.map((property) => ({
          property,
          value: element.style.getPropertyValue(property),
          priority: element.style.getPropertyPriority(property),
        })),
      })
    )

    for (const { element } of savedStyles) {
      element.style.setProperty('overflow', 'hidden')
      element.style.setProperty('overscroll-behavior-y', 'none')
    }

    return () => {
      for (const { element, values } of savedStyles) {
        for (const { property, value, priority } of values) {
          if (value) element.style.setProperty(property, value, priority)
          else element.style.removeProperty(property)
        }
      }
    }
  }, [hasModals])

  useEffect(() => {
    modalsRef.current = modals
  }, [modals])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const onPopState = () => {
      if (ignoreNextPopstateRef.current) {
        ignoreNextPopstateRef.current = false
        return
      }
      if (modalsRef.current.length === 0) return
      setModals((current) => current.slice(0, -1))
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [setModals])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const prevLength = prevLengthRef.current

    if (modals.length > prevLength) {
      window.history.pushState({ modal: true }, '', window.location.href)
    } else if (modals.length < prevLength) {
      ignoreNextPopstateRef.current = true
      window.history.back()
    }

    prevLengthRef.current = modals.length
  }, [modals.length])

  return (
    <div className="fixed top-0 z-50 w-full">
      {modals.map(({ id, props }) => (
        <Modal {...props} id={id} key={'modal' + id} />
      ))}
    </div>
  )
}

export default ModalsPortal
