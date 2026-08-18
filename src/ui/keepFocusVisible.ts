export function scrollDeltaForRect(
  rect: { top: number; bottom: number },
  visibleTop: number,
  visibleBottom: number,
  pad = 24,
): number {
  const limitBottom = visibleBottom - pad
  const limitTop = visibleTop + pad
  if (rect.bottom > limitBottom) return rect.bottom - limitBottom
  if (rect.top < limitTop) return rect.top - limitTop
  return 0
}

export function overlayFromViewport(
  innerHeight: number,
  vv: { height: number; offsetTop: number } | null,
): number {
  if (!vv) return 0
  return Math.max(0, innerHeight - vv.height - vv.offsetTop)
}

export function keyboardPadding(args: {
  innerHeight: number
  baselineInnerHeight: number
  viewportOverlay: number
  virtualKeyboardHeight: number
  focused: boolean
}): number {
  const measured = Math.max(args.viewportOverlay, args.virtualKeyboardHeight)
  if (measured > 0) return measured + 48
  const layoutShrunk = args.baselineInnerHeight - args.innerHeight
  if (layoutShrunk > 80) return 48
  if (args.focused) return Math.round(args.innerHeight * 0.45)
  return 0
}

export function visibleBoundsWithKeyboard(
  innerHeight: number,
  vv: { height: number; offsetTop: number } | null,
  keyboardPad: number,
): { top: number; bottom: number } {
  const top = vv ? vv.offsetTop : 0
  const vvBottom = vv ? vv.offsetTop + vv.height : innerHeight
  const alreadyObscured = Math.max(0, innerHeight - vvBottom)
  const extraCover = Math.max(0, keyboardPad - alreadyObscured)
  return { top, bottom: vvBottom - extraCover }
}

export function pickCaretRect(
  rangeRect: { top: number; bottom: number; width: number; height: number },
  fallback: { top: number; bottom: number } | null,
): { top: number; bottom: number } | null {
  if (rangeRect.height > 0 || rangeRect.width > 0) {
    return { top: rangeRect.top, bottom: rangeRect.bottom }
  }
  return fallback
}

function virtualKeyboardHeight(): number {
  const vk = (navigator as Navigator & { virtualKeyboard?: { boundingRect: { height: number } } }).virtualKeyboard
  return Math.max(0, vk?.boundingRect.height ?? 0)
}

function isEditing(): boolean {
  const active = document.activeElement
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return true
  return active instanceof HTMLElement && active.isContentEditable
}

function currentPadding(baselineInnerHeight: number): number {
  const vv = window.visualViewport
  return keyboardPadding({
    innerHeight: window.innerHeight,
    baselineInnerHeight,
    viewportOverlay: overlayFromViewport(window.innerHeight, vv),
    virtualKeyboardHeight: virtualKeyboardHeight(),
    focused: isEditing(),
  })
}

function focusedRect(): { top: number; bottom: number } | null {
  const active = document.activeElement
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    const rect = active.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom }
  }
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode) return null
  const editor = document.querySelector('.ProseMirror')
  if (!editor || !editor.contains(sel.anchorNode)) return null
  const rangeRect = sel.getRangeAt(0).getBoundingClientRect()
  const node = sel.anchorNode
  const el = node instanceof Element ? node : node.parentElement
  const fallbackRect = el instanceof HTMLElement ? el.getBoundingClientRect() : null
  return pickCaretRect(
    rangeRect,
    fallbackRect ? { top: fallbackRect.top, bottom: fallbackRect.bottom } : null,
  )
}

export function revealFocusedInput(baselineInnerHeight = window.innerHeight): void {
  const vv = window.visualViewport
  const pad = currentPadding(baselineInnerHeight)
  const bounds = visibleBoundsWithKeyboard(window.innerHeight, vv, pad)
  const rect = focusedRect()
  if (!rect) return
  const delta = scrollDeltaForRect(rect, bounds.top, bounds.bottom)
  if (delta === 0) return
  const scroller = document.scrollingElement
  if (scroller) scroller.scrollBy(0, delta)
  else window.scrollBy(0, delta)
}

export function bindKeyboardReveal(): () => void {
  const vv = window.visualViewport
  let baseline = window.innerHeight
  const vk = (navigator as Navigator & {
    virtualKeyboard?: { addEventListener: (type: string, listener: () => void) => void; removeEventListener: (type: string, listener: () => void) => void }
  }).virtualKeyboard

  const syncInset = () => {
    document.documentElement.style.setProperty('--keyboard-inset', `${currentPadding(baseline)}px`)
  }
  const reveal = () => {
    if (!isEditing()) baseline = window.innerHeight
    syncInset()
    void document.documentElement.offsetHeight
    revealFocusedInput(baseline)
    requestAnimationFrame(() => revealFocusedInput(baseline))
  }

  const onFocusOut = () => requestAnimationFrame(reveal)
  vv?.addEventListener('resize', reveal)
  vv?.addEventListener('scroll', reveal)
  window.addEventListener('resize', reveal)
  document.addEventListener('selectionchange', reveal)
  document.addEventListener('focusin', reveal)
  document.addEventListener('focusout', onFocusOut)
  vk?.addEventListener('geometrychange', reveal)
  syncInset()
  return () => {
    vv?.removeEventListener('resize', reveal)
    vv?.removeEventListener('scroll', reveal)
    window.removeEventListener('resize', reveal)
    document.removeEventListener('selectionchange', reveal)
    document.removeEventListener('focusin', reveal)
    document.removeEventListener('focusout', onFocusOut)
    vk?.removeEventListener('geometrychange', reveal)
  }
}
