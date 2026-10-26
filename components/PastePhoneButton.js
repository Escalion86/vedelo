import { useAtomValue } from 'jotai'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import modalsFuncAtom from '@state/atoms/modalsFuncAtom'
import useSnackbar from '@helpers/useSnackbar'
import { phoneNumbersFromText } from '@helpers/phoneNumbersFromText.mjs'
import selectClipboardPhoneFunc from '@layouts/modals/modalsFunc/selectClipboardPhoneFunc'
import ClipboardActionButton from './ClipboardActionButton'

const PastePhoneButton = ({ onChange }) => {
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const snackbar = useSnackbar()
  const [loading, setLoading] = useState(false)
  const pending = useRef(false)
  const disposed = useRef(false)
  const latestOnChange = useRef(onChange)

  useLayoutEffect(() => {
    latestOnChange.current = onChange
  }, [onChange])

  useEffect(() => {
    disposed.current = false
    return () => { disposed.current = true }
  }, [])

  const selectPhone = (phone) => {
    if (!disposed.current) latestOnChange.current(Number(phone))
  }

  const paste = async () => {
    if (pending.current) return
    pending.current = true
    setLoading(true)
    try {
      const text = await navigator.clipboard.readText()
      if (disposed.current) return
      const phones = phoneNumbersFromText(text)
      if (!phones.length) {
        snackbar.info('В буфере обмена не найден номер телефона')
      } else if (phones.length === 1) {
        selectPhone(phones[0])
      } else {
        modalsFunc.add(selectClipboardPhoneFunc(phones, selectPhone))
      }
    } catch {
      if (!disposed.current)
        snackbar.error('Не удалось прочитать буфер обмена. Вставьте номер вручную')
    } finally {
      pending.current = false
      if (!disposed.current) setLoading(false)
    }
  }

  return (
    <ClipboardActionButton
      action="paste"
      onClick={paste}
      title="Вставить номер"
      disabled={loading}
      loading={loading}
    />
  )
}

export default PastePhoneButton
