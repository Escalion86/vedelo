import SideBar from '@layouts/SideBar'

const ContentWrapper = ({ children, page }) => {
  return (
    <div
      className="relative flex h-full max-h-full min-h-0 max-w-[100vw]"
      style={{
        gridArea: 'content',
        // gridTemplateRows: 'auto',
        // gridTemplateColumns: 'auto 1fr',
        // gridTemplateAreas: `
        //   'sidebar child'
        // `,
      }}
    >
      <SideBar page={page} />
      <div
        className="cabinet-canvas flex min-w-0 max-w-[100vw] flex-1 flex-col"
        // style={{ gridArea: 'child' }}
      >
        {children}
      </div>
    </div>
  )
}

export default ContentWrapper
