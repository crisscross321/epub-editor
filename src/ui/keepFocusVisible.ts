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
  // Focus alone is not evidence of a software keyboard (desktop/hardware keyboard).
  if (args.focused) return 0
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

export function shouldRevealFocusedInput(args: { collapsed: boolean; interacting: boolean }): boolean {
  // Never chase a selection's bounding box, including during IME composition.
  return args.collapsed && !args.interacting
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
  if (!(active instanceof HTMLElement) || !active.isContentEditable) return null
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
  const selection = window.getSelection()
  if (selection?.rangeCount && !selection.isCollapsed) return
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
  let frame: number | null = null
  let disposed = false
  let touching = false
  const pointers = new Set<number>()
  const vk = (navigator as Navigator & {
    virtualKeyboard?: { addEventListener: (type: string, listener: () => void) => void; removeEventListener: (type: string, listener: () => void) => void }
  }).virtualKeyboard

  const syncInset = () => {
    if (!isEditing()) baseline = window.innerHeight
    const value = `${currentPadding(baseline)}px`
    const style = document.documentElement.style
    if (style.getPropertyValue('--keyboard-inset') !== value) style.setProperty('--keyboard-inset', value)
  }
  const cancelReveal = () => {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
  }
  const canReveal = () => {
    if (disposed || !isEditing()) return false
    const sel = window.getSelection()
    return shouldRevealFocusedInput({
      collapsed: !sel || sel.rangeCount === 0 || sel.isCollapsed,
      interacting: touching || pointers.size > 0,
    })
  }
  const reveal = () => {
    cancelReveal()
    syncInset()
    if (!canReveal()) return
    revealFocusedInput(baseline)
    const scrollTop = document.scrollingElement?.scrollTop ?? window.scrollY
    frame = requestAnimationFrame(() => {
      frame = null
      // Native edge-scroll or the user may have moved the viewport meanwhile.
      const currentScroll = document.scrollingElement?.scrollTop ?? window.scrollY
      if (canReveal() && currentScroll === scrollTop) revealFocusedInput(baseline)
    })
  }
  const onSelectionChange = () => {
    // Selection handles and native edge auto-scroll own the viewport. Inset
    // maintenance must not turn a selectionchange into a scroll command.
    cancelReveal()
    syncInset()
  }
  const onPointerDown = (event: PointerEvent) => {
    pointers.add(event.pointerId)
    cancelReveal()
  }
  const onPointerEnd = (event: PointerEvent) => { pointers.delete(event.pointerId) }
  const onTouchStart = () => {
    touching = true
    cancelReveal()
  }
  const onTouchEnd = (event: TouchEvent) => { touching = event.touches.length > 0 }
  const onBlur = () => {
    pointers.clear()
    touching = false
    cancelReveal()
  }
  const onFocusOut = () => {
    cancelReveal()
    frame = requestAnimationFrame(() => {
      frame = null
      if (!disposed) syncInset()
    })
  }
  vv?.addEventListener('resize', reveal)
  window.addEventListener('resize', reveal)
  window.addEventListener('blur', onBlur)
  document.addEventListener('selectionchange', onSelectionChange)
  document.addEventListener('focusin', reveal)
  document.addEventListener('focusout', onFocusOut)
  document.addEventListener('input', reveal)
  document.addEventListener('compositionend', reveal)
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('pointerup', onPointerEnd, true)
  document.addEventListener('pointercancel', onPointerEnd, true)
  document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
  document.addEventListener('touchend', onTouchEnd, true)
  document.addEventListener('touchcancel', onTouchEnd, true)
  vk?.addEventListener('geometrychange', reveal)
  syncInset()
  return () => {
    disposed = true
    cancelReveal()
    vv?.removeEventListener('resize', reveal)
    window.removeEventListener('resize', reveal)
    window.removeEventListener('blur', onBlur)
    document.removeEventListener('selectionchange', onSelectionChange)
    document.removeEventListener('focusin', reveal)
    document.removeEventListener('focusout', onFocusOut)
    document.removeEventListener('input', reveal)
    document.removeEventListener('compositionend', reveal)
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('pointerup', onPointerEnd, true)
    document.removeEventListener('pointercancel', onPointerEnd, true)
    document.removeEventListener('touchstart', onTouchStart, true)
    document.removeEventListener('touchend', onTouchEnd, true)
    document.removeEventListener('touchcancel', onTouchEnd, true)
    vk?.removeEventListener('geometrychange', reveal)
    document.documentElement.style.removeProperty('--keyboard-inset')
  }
}
