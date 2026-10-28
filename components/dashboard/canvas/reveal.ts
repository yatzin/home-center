/** The nearest ancestor of `el` that scrolls vertically (the app's <main>), or null. */
export function scrollParent(el: HTMLElement): HTMLElement | null {
  let scroller = el.parentElement
  while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
  return scroller
}

/**
 * Scrolls the nearest scrolling ancestor just enough to show `el`. Not
 * scrollIntoView: that also scrolls the app shell's overflow-hidden boxes.
 */
export function reveal(el: HTMLElement) {
  const scroller = scrollParent(el)
  if (!scroller) return
  const box = scroller.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  const margin = 96
  if (r.top < box.top + margin) scroller.scrollBy({ top: r.top - box.top - margin })
  else if (r.bottom > box.bottom - margin) scroller.scrollBy({ top: r.bottom - box.bottom + margin })
}
