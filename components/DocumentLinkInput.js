import useSnackbar from '@helpers/useSnackbar'
import { useState } from 'react'
import ClipboardActionButton from './ClipboardActionButton'
import Input from './Input'

export default function DocumentLinkInput({ value, onChange }) {
  const snackbar = useSnackbar()
  const [pasting, setPasting] = useState(false)

  const pasteLink = async () => {
    setPasting(true)
    try {
      const text = (await navigator.clipboard.readText()).trim()
      if (text) {
        onChange(text)
      } else {
        snackbar.info('Буфер обмена пуст')
      }
    } catch {
      snackbar.error('Не удалось прочитать буфер обмена. Вставьте ссылку вручную')
    } finally {
      setPasting(false)
    }
  }

  return (
    <Input
      label="Ссылка"
      ariaLabel="Ссылка"
      value={value}
      onChange={onChange}
      inputClassName="min-w-0"
      postfix={
        <ClipboardActionButton
          action="paste"
          title="Вставить ссылку"
          onClick={pasteLink}
          large
          disabled={pasting}
          loading={pasting}
        />
      }
      noMargin
      fullWidth
    />
  )
}
