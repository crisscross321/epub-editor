import { test, expect, type Page } from '@playwright/test'

async function seed(page: Page, mode = 'scroll', offset = 0.55) {
  await page.goto('/')
  await page.evaluate(async ({ mode, offset }) => {
    const db = await import('/src/storage/idb.ts')
    const settings = await import('/src/storage/settings.ts')
    settings.saveSettings({ onboardingDone: true, readMode: mode })
    const chapters = Array.from({ length: 9 }, (_, i) => ({
      id: `ch${i + 1}`, title: `审查章节${i + 1}`, spineIndex: i,
      href: `OEBPS/ch${i + 1}.xhtml`, state: 'simplified',
    }))
    await db.putBook({ id: 'audit', title: '可靠性测试书', author: '', language: 'zh-CN',
      updatedAt: new Date().toISOString(), opfHref: 'OEBPS/content.opf', chapters,
      readChapterId: 'ch5', readOffset: offset, lastReadAt: new Date().toISOString() })
    for (const ch of chapters) await db.putDoc('audit', ch.id, { type: 'doc', content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: ch.title }] },
      ...Array.from({ length: 85 }, (_, i) => ({ type: 'paragraph', content: [{ type: 'text',
        text: `${ch.id} 第${i}段。山川远阔，流水悠悠。这是用于检验滚动、保存和搜索的正文。` }] })),
    ] })
  }, { mode, offset })
  await page.reload()
  await page.getByRole('button', { name: /继续阅读/ }).click()
  await expect(page.locator('.reader')).toBeVisible()
}

async function position(page: Page) {
  return page.locator('.preview-stream').evaluate((el) => {
    const ch = el.querySelector('[data-chapter-id="ch5"]') as HTMLElement
    return (el.scrollTop - ch.offsetTop) / (ch.offsetHeight - el.clientHeight)
  })
}

test('restores the actual middle of a chapter after async hydration', async ({ page }) => {
  await seed(page)
  await expect.poll(() => position(page)).toBeCloseTo(0.55, 1)
})

test('typing a search draft does not clear or relocate the reading surface', async ({ page }) => {
  await seed(page, 'scroll', 0)
  await page.locator('.preview-stream').evaluate(el => { el.scrollTop += 1500 })
  await page.waitForTimeout(600)
  const before = await page.locator('.preview-stream').evaluate(el => el.scrollTop)
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  await page.getByPlaceholder('书中的一句话').fill('流水')
  await page.waitForTimeout(500)
  const after = await page.locator('.preview-stream').evaluate(el => el.scrollTop)
  expect(Math.abs(after - before)).toBeLessThan(3)
})

test('clicking the paged reader repeatedly advances beyond page two', async ({ page }) => {
  await seed(page, 'page', 0)
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('p').first()).toBeVisible()
  await page.waitForTimeout(400)
  await frame.locator('body').click({ position: { x: 580, y: 100 } })
  await page.waitForTimeout(200)
  const first = await page.locator('iframe').evaluate(el => (el as HTMLIFrameElement).contentDocument!.documentElement.scrollTop)
  await frame.locator('body').click({ position: { x: 580, y: first + 100 } })
  await page.waitForTimeout(200)
  const second = await page.locator('iframe').evaluate(el => (el as HTMLIFrameElement).contentDocument!.documentElement.scrollTop)
  expect(first).toBeGreaterThan(0)
  expect(second).toBeGreaterThan(first + 50)
})

test('whole-book replace updates the visible editor and survives another input', async ({ page }) => {
  await seed(page, 'scroll', 0)
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  const editor = page.locator('.ProseMirror')
  await expect(editor).toContainText('流水悠悠')
  await page.getByRole('button', { name: '查找', exact: true }).first().click()
  await page.getByPlaceholder('查找', { exact: true }).fill('流水悠悠')
  await page.getByPlaceholder('替换为', { exact: true }).fill('清风徐来')
  await page.getByRole('button', { name: '全书替换', exact: true }).click()
  const confirm = page.getByRole('button', { name: '确认替换', exact: true })
  if (await confirm.isVisible()) await confirm.click()
  await expect(editor).toContainText('清风徐来')
  await expect(editor).not.toContainText('流水悠悠')
  await editor.press('ControlOrMeta+End')
  await editor.press('End')
  await editor.press('!')
  await page.getByRole('button', { name: '预览', exact: true }).click()
  await expect(page.locator('[data-chapter-id="ch5"]')).toContainText('清风徐来')
})

test('leaving to preview waits for saved text, including the last keystroke', async ({ page }) => {
  await seed(page, 'scroll', 0)
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await page.locator('.ProseMirror').fill('最后一次修改必须出现')
  await page.getByRole('button', { name: '预览', exact: true }).click()
  await expect(page.locator('[data-chapter-id="ch5"]')).toContainText('最后一次修改必须出现')
})

test('late layout growth below the viewport does not push the current paragraph', async ({ page }) => {
  await seed(page)
  await expect.poll(() => position(page)).toBeCloseTo(0.55, 1)
  const before = await page.locator('.preview-stream').evaluate(el => el.scrollTop)
  await page.locator('[data-chapter-id="ch5"]').evaluate(el => {
    const lateImage = document.createElement('div')
    lateImage.style.height = '800px'
    lateImage.style.minHeight = '800px'
    el.append(lateImage)
  })
  await page.waitForTimeout(250)
  expect(await page.locator('.preview-stream').evaluate(el => el.scrollTop)).toBeCloseTo(before, 0)
})

test('continuous scrolling crosses hydration windows without returning to a chapter start', async ({ page }) => {
  await seed(page, 'scroll', 0)
  for (let i = 0; i < 35; i++) {
    const before = await page.locator('.preview-stream').evaluate(el => { el.scrollTop += 350; return el.scrollTop })
    await page.waitForTimeout(70)
    const after = await page.locator('.preview-stream').evaluate(el => el.scrollTop)
    expect(after).toBeGreaterThanOrEqual(before - 3)
  }
  await expect(page.locator('.reader-bottom')).not.toContainText('第 5 章')
})

test('font changes keep the visible paragraph anchored', async ({ page }) => {
  await seed(page)
  await expect.poll(() => position(page)).toBeCloseTo(0.55, 1)
  const before = await page.locator('.preview-stream').evaluate(el => {
    const top = el.getBoundingClientRect().top
    const p = [...el.querySelectorAll('p')].find(p => p.getBoundingClientRect().bottom > top)!
    p.setAttribute('data-audit-anchor', 'true')
    return p.getBoundingClientRect().top - top
  })
  await page.getByRole('button', { name: '版式', exact: true }).click()
  await page.getByRole('button', { name: '大 22', exact: true }).click()
  await page.getByRole('button', { name: '关闭面板' }).click()
  const after = await page.locator('.preview-stream').evaluate(el => el.querySelector('[data-audit-anchor]')!.getBoundingClientRect().top - el.getBoundingClientRect().top)
  expect(Math.abs(after - before)).toBeLessThan(3)
})

test('whole-chapter replacement participates in native undo', async ({ page }) => {
  await seed(page, 'scroll', 0)
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await page.getByRole('button', { name: '查找', exact: true }).first().click()
  await page.getByPlaceholder('查找', { exact: true }).fill('流水悠悠')
  await page.getByPlaceholder('替换为', { exact: true }).fill('可以撤销')
  await page.getByRole('button', { name: '全部替换', exact: true }).click()
  await expect(page.locator('.ProseMirror')).toContainText('可以撤销')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.locator('.ProseMirror')).toContainText('流水悠悠')
  await expect(page.locator('.ProseMirror')).not.toContainText('可以撤销')
})

test('failed persistence keeps the editor and offers retry instead of navigating away', async ({ page }) => {
  await seed(page, 'scroll', 0)
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    ;(window as any).__restorePut = () => { IDBObjectStore.prototype.put = original }
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'docs') throw new DOMException('quota exhausted', 'QuotaExceededError')
      return original.apply(this, args as any)
    }
  })
  await page.locator('.ProseMirror').fill('保存失败也不能丢的文字')
  await page.getByRole('button', { name: '预览', exact: true }).click()
  await expect(page.locator('.ProseMirror')).toContainText('保存失败也不能丢的文字')
  await expect(page.getByRole('button', { name: '重试保存' })).toBeVisible()
  await page.evaluate(() => (window as any).__restorePut())
  await page.getByRole('button', { name: '重试保存' }).click()
  await expect(page.locator('.save-status')).toContainText('已保存到本机')
  await page.getByRole('button', { name: '预览', exact: true }).click()
  await expect(page.locator('[data-chapter-id="ch5"]')).toContainText('保存失败也不能丢的文字')
})

test('mobile viewport keeps position when switching between scroll and page modes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seed(page)
  await expect.poll(() => position(page)).toBeCloseTo(0.55, 1)
  await page.getByRole('button', { name: '版式', exact: true }).click()
  await page.getByRole('button', { name: '翻页', exact: true }).click()
  await page.getByRole('button', { name: '关闭面板' }).click()
  await expect.poll(() => page.locator('iframe').evaluate(el => {
    const doc = (el as HTMLIFrameElement).contentDocument!.documentElement
    return doc.scrollTop / (doc.scrollHeight - doc.clientHeight)
  })).toBeCloseTo(0.55, 1)
  await page.getByRole('button', { name: '版式', exact: true }).click()
  await page.getByRole('button', { name: '滚动', exact: true }).click()
  await page.getByRole('button', { name: '关闭面板' }).click()
  await expect.poll(() => position(page)).toBeCloseTo(0.55, 1)
})

test('submitted search keeps location and bookmarks return within the chapter', async ({ page }) => {
  await seed(page)
  await expect.poll(() => position(page)).toBeCloseTo(0.55, 1)
  const before = await position(page)
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  await page.getByPlaceholder('书中的一句话').fill('流水')
  await page.getByRole('button', { name: '找', exact: true }).click()
  await expect(page.locator('.drawer-item').first()).toBeVisible()
  await page.getByRole('button', { name: '关闭面板' }).click()
  expect(await position(page)).toBeCloseTo(before, 1)
  await page.getByRole('button', { name: '笔记', exact: true }).click()
  await page.getByRole('button', { name: '在本章加书签', exact: true }).click()
  await expect(page.locator('.note-card')).toHaveCount(1)
  await page.getByRole('button', { name: '关闭面板' }).click()
  await page.getByRole('button', { name: '下一章', exact: true }).click()
  await page.getByRole('button', { name: '笔记', exact: true }).click()
  await page.getByRole('button', { name: '打开', exact: true }).click()
  await expect.poll(() => position(page)).toBeCloseTo(before, 1)
})

test('scroll-mode edge taps do not unexpectedly switch chapters', async ({ page }) => {
  await seed(page)
  await expect.poll(() => position(page)).toBeCloseTo(0.55, 1)
  await page.locator('.preview-stream').click({ position: { x: 5, y: 200 } })
  await page.locator('.preview-stream').click({ position: { x: 5, y: 200 } })
  await expect(page.locator('.reader-bottom')).toContainText('第 5 章')
  expect(await position(page)).toBeCloseTo(0.55, 1)
})
