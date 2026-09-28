'use client'

import { useEffect, useState } from 'react'
import ProposalLineEditor from '@components/ProposalLineEditor'

export default function ProposalLineDialog({
  initialLine,
  index,
  services,
  onApply,
  closeModal,
  setOnConfirmFunc,
  setDisableConfirm,
  setOnShowOnCloseConfirmDialog,
}) {
  const [line, setLine] = useState(() => ({ ...initialLine }))

  useEffect(() => {
    setDisableConfirm(!line.title.trim())
    setOnShowOnCloseConfirmDialog(
      JSON.stringify(line) !== JSON.stringify(initialLine)
    )
    setOnConfirmFunc(() => {
      if (!line.title.trim()) return
      onApply({ ...line, title: line.title.trim() })
      closeModal()
    })
  }, [
    line,
    initialLine,
    onApply,
    closeModal,
    setOnConfirmFunc,
    setDisableConfirm,
    setOnShowOnCloseConfirmDialog,
  ])

  return (
    <ProposalLineEditor
      line={line}
      index={index}
      services={services}
      onChange={(patch) => setLine((current) => ({ ...current, ...patch }))}
    />
  )
}
