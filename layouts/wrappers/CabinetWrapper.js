'use client'

import { useAtomValue } from 'jotai'
import MobileBottomNav from '@components/MobileBottomNav'
import WhatsNewToast from '@components/WhatsNewToast'
import windowDimensionsTailwindSelector from '@state/selectors/windowDimensionsTailwindSelector'

const CabinetWrapper = ({ children }) => {
  const device = useAtomValue(windowDimensionsTailwindSelector)
  const isPhone = device === 'phoneV' || device === 'phoneH'

  return (
    <div
      className="grid h-[100dvh] max-h-[100dvh] w-full overflow-hidden"
      style={
        isPhone
          ? {
              gridTemplateRows: 'auto 1fr auto',
              gridTemplateColumns: 'minmax(0, 1fr)',
              gridTemplateAreas: `
                'header'
                'content'
                'bottomnav'
              `,
            }
          : {
              gridTemplateRows: 'auto 1fr auto',
              gridTemplateColumns: '64px minmax(0, 1fr)',
              gridTemplateAreas: `
                'burger header'
                'content content'
                'bottomnav bottomnav'
              `,
            }
      }
    >
      {children}
      <MobileBottomNav />
      <WhatsNewToast />
    </div>
  )
}

export default CabinetWrapper
