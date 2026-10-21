// Runs after the native summary action, so measurements include the open body.
export default function scrollExpandedEventSection(event) {
  const summary = event.target.closest?.('summary')
  const section = summary?.parentElement
  if (
    event.defaultPrevented ||
    !section?.matches('details.compact-event-section') ||
    section.open ||
    !event.currentTarget.contains(section)
  ) return

  requestAnimationFrame(() => {
    if (!section.isConnected || !section.open) return
    let scroller = section.parentElement
    while (scroller && !/^(auto|scroll)$/.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement
    }
    if (!scroller) return

    const bounds = scroller.getBoundingClientRect()
    const top = bounds.top + scroller.clientTop + 8
    const bottom = bounds.top + scroller.clientTop + scroller.clientHeight - 8
    const block = section.getBoundingClientRect()
    if (block.top >= top && block.bottom <= bottom) return

    const delta = block.height > bottom - top || block.top < top
      ? block.top - top
      : block.bottom - bottom
    scroller.scrollBy({
      top: delta,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
  })
}
