import { test, expect, type Page } from '@playwright/test'

async function openEditor(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/__keyboard-test__', route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/src/index.css">
      <main class="app"><div class="ProseMirror" contenteditable="true"></div></main>
      <script type="module">
        import { bindKeyboardReveal } from '/src/ui/keepFocusVisible.ts';
        const editor = document.querySelector('.ProseMirror');
        for (let i = 0; i < 90; i++) {
          const p = document.createElement('p');
          p.textContent = '第' + i + '段：向下拖动选区应当持续滚动，最后一行也应完整可见。';
          editor.append(p);
        }
        window.unbindKeyboard = bindKeyboardReveal();
        window.keyboardReady = true;
      </script>`,
  }))
  await page.goto('/__keyboard-test__')
  await page.waitForFunction(() => (window as any).keyboardReady)
  await page.locator('.ProseMirror').evaluate((el: HTMLElement) => {
    el.focus({ preventScroll: true })
    const text = el.querySelector('p')!.firstChild!
    window.getSelection()!.setBaseAndExtent(text, 1, text, 1)
  })
  await page.waitForTimeout(50)
}

async function lastLineBottom(page: Page) {
  return page.locator('.ProseMirror p').last().evaluate(el => {
    const range = document.createRange()
    range.selectNodeContents(el)
    return range.getBoundingClientRect().bottom
  })
}

test('a resized native WebView can scroll all final lines above the IME', async ({ page }) => {
  await openEditor(page)
  await page.setViewportSize({ width: 390, height: 480 })
  await expect(page.locator('html')).toHaveCSS('--keyboard-inset', '48px')
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  expect(await lastLineBottom(page)).toBeLessThan(480 - 24)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('html')).toHaveCSS('--keyboard-inset', '0px')
})

test('a measured overlay leaves scrollable space without a guessed keyboard height', async ({ page }) => {
  await openEditor(page)
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => 480 })
    window.visualViewport!.dispatchEvent(new Event('resize'))
    window.scrollTo(0, document.documentElement.scrollHeight)
  })
  await expect(page.locator('html')).toHaveCSS('--keyboard-inset', '412px')
  expect(await lastLineBottom(page)).toBeLessThan(480 - 24)
})

test('a deferred caret reveal cannot yank a selection started before the next frame', async ({ page }) => {
  await openEditor(page)
  const result = await page.evaluate(async () => {
    const editor = document.querySelector('.ProseMirror')!
    const paragraphs = editor.querySelectorAll('p')
    const first = paragraphs[0].firstChild!
    const last = paragraphs[89].firstChild!
    const selection = window.getSelection()!
    selection.setBaseAndExtent(first, 0, first, 0)
    window.dispatchEvent(new Event('resize'))
    selection.setBaseAndExtent(first, 0, last, 6)
    window.scrollTo(0, 1600)
    const before = window.scrollY
    await new Promise(requestAnimationFrame)
    return { before, after: window.scrollY, text: selection.toString() }
  })
  expect(result.after).toBe(result.before)
  expect(result.text).toContain('第89段')
})

test('selection can extend across screens with IME events and viewport changes', async ({ page }) => {
  await openEditor(page)
  await page.setViewportSize({ width: 390, height: 480 })
  const result = await page.evaluate(async () => {
    const editor = document.querySelector('.ProseMirror')!
    const paragraphs = editor.querySelectorAll('p')
    const first = paragraphs[0].firstChild!
    const selection = window.getSelection()!
    const positions: number[] = []
    for (const index of [12, 35, 60, 89]) {
      selection.setBaseAndExtent(first, 0, paragraphs[index].firstChild!, 6)
      window.scrollTo(0, (paragraphs[index] as HTMLElement).offsetTop - 260)
      const before = window.scrollY
      document.dispatchEvent(new Event('selectionchange'))
      editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }))
      window.visualViewport!.dispatchEvent(new Event('resize'))
      await new Promise(requestAnimationFrame)
      positions.push(window.scrollY - before)
    }
    return { positions, text: selection.toString(), scroll: window.scrollY }
  })
  expect(result.positions).toEqual([0, 0, 0, 0])
  expect(result.text).toContain('第89段')
  expect(result.scroll).toBeGreaterThan(480 * 3)
})

test('pointer gestures and unbinding both cancel pending automatic scrolls', async ({ page }) => {
  await openEditor(page)
  const positions = await page.evaluate(async () => {
    const positions: number[] = []
    window.dispatchEvent(new Event('resize'))
    document.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7 }))
    window.scrollTo(0, 1200)
    window.dispatchEvent(new Event('resize'))
    await new Promise(requestAnimationFrame)
    positions.push(window.scrollY)
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7 }))
    window.dispatchEvent(new Event('resize'))
    ;(window as any).unbindKeyboard()
    window.scrollTo(0, 1800)
    await new Promise(requestAnimationFrame)
    positions.push(window.scrollY)
    return positions
  })
  expect(positions).toEqual([1200, 1800])
})
