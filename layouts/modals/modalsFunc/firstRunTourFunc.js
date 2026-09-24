import { useRef, useState } from 'react'
import { useAtom } from 'jotai'
import { useRouter } from 'next/navigation'
import FirstRunTour from '@components/FirstRunTour'
import Notice from '@components/Notice'
import { postData } from '@helpers/CRUD'
import { FIRST_RUN_TOUR_KEY } from '@helpers/firstRunWizard.mjs'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'

export const FirstRunTourModal = ({ closeModal }) => {
  const [settings, setSettings] = useAtom(siteSettingsAtom)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const lock = useRef(false)
  const router = useRouter()
  const exit = async (result) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError(false)
    try {
      const saved = await postData('/api/site', {
        custom: { ...settings?.custom, [FIRST_RUN_TOUR_KEY]: result },
      })
      if (!saved) {
        setError(true)
        return
      }
      setSettings(saved)
      closeModal()
      router.push('/cabinet/attention')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <>
      <FirstRunTour
        presetKey={settings?.custom?.onboardingActivityPreset}
        terminology={settings?.custom?.primaryEntityTerminology}
        onExit={exit}
        busy={busy}
      />
      {error && (
        <Notice tone="error" className="mt-3">
          Не удалось сохранить результат. Повторите выход или{' '}
          <button
            className="cursor-pointer underline"
            type="button"
            onClick={() => {
              closeModal()
              router.push('/cabinet/attention')
            }}
          >
            перейдите в кабинет без сохранения
          </button>
          .
        </Notice>
      )}
    </>
  )
}

export default function firstRunTourFunc() {
  return {
    title: 'Первые шаги в Ведело',
    Children: FirstRunTourModal,
    closeButtonShow: false,
    declineButtonShow: false,
    crossShow: false,
  }
}
