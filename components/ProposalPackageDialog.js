'use client'

import { useEffect, useState } from 'react'
import ProposalPackageForm, {
  PROPOSAL_PACKAGE_LINES_LIMIT,
} from '@components/ProposalPackageForm'

export default function ProposalPackageDialog({
  initialPackage,
  services,
  servicesLoading,
  servicesError,
  onApply,
  closeModal,
  setOnConfirmFunc,
  setDisableConfirm,
  setOnShowOnCloseConfirmDialog,
}) {
  const [value, setValue] = useState(() =>
    JSON.parse(JSON.stringify(initialPackage))
  )
  const valid =
    Boolean(value.title.trim()) &&
    Number.isFinite(Number(value.total)) &&
    Number(value.total) >= 0 &&
    value.lines.length <= PROPOSAL_PACKAGE_LINES_LIMIT

  useEffect(() => {
    setDisableConfirm(!valid)
    setOnShowOnCloseConfirmDialog(
      JSON.stringify(value) !== JSON.stringify(initialPackage)
    )
    setOnConfirmFunc(() => {
      if (!valid) return
      onApply({
        ...value,
        title: value.title.trim(),
        total: Number(value.total),
      })
      closeModal()
    })
  }, [
    value,
    initialPackage,
    valid,
    onApply,
    closeModal,
    setOnConfirmFunc,
    setDisableConfirm,
    setOnShowOnCloseConfirmDialog,
  ])

  return (
    <ProposalPackageForm
      value={value}
      onChange={setValue}
      services={services}
      servicesLoading={servicesLoading}
      servicesError={servicesError}
    />
  )
}
