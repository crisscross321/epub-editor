# EPUB Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Capacitor + React mobile-first EPUB 3 editor (素笺) that can create books, open existing EPUBs, simplify-edit confirmed chapters, leave unopened chapters byte-identical, and export.

**Architecture:** Client-only. UI screens talk to a book service. The EPUB engine parses/packs zip+OPF and converts one chapter at a time to a TipTap document. Capacitor Filesystem holds the in-app bookshelf; web preview uses the plugin’s IndexedDB fallback; Save As downloads on web and writes Documents on Android.

**Tech Stack:** Vite, React 19, TypeScript, TipTap, JSZip, Vitest + happy-dom, Capacitor 7 (Node 20; Capacitor 8 needs Node 22+), `@capacitor/filesystem`, `@capacitor/status-bar`. No Camera plugin.

---

## File map

```
src/
  main.tsx                          # boot, status bar
  App.tsx                           # screen router (no react-router; in-memory nav)
  index.css                         # paper/ink theme
  types/book.ts                     # BookRecord, ChapterIndex, errors
  epub/errors.ts                    # EpubError + Chinese messages
  epub/xml.ts                       # parseXml, qs, attr helpers
  epub/paths.ts                     # resolve relative hrefs inside the package
  epub/parse.ts                     # ArrayBuffer → ParsedEpub
  epub/simplify.ts                  # XHTML string → TipTap JSON
  epub/serialize.ts                 # TipTap JSON → XHTML; pack EPUB 3
  epub/fixtures.ts                  # in-memory EPUB builders for tests
  storage/idb.ts                    # IndexedDB-backed book workspace (web + Capacitor web)
  storage/workspace.ts              # save/load BookRecord, entries, chapter docs, images
  storage/files.ts                  # pick epub/image (no capture); save-as / download
  images/compress.ts                # resize + jpeg/png size cap ~2MB
  editor/schema.ts                  # TipTap extensions (headings 1-6, bold, italic, lists, image)
  editor/ChapterEditor.tsx
  ui/theme.css
  ui/AppShell.tsx
  ui/Dialog.tsx
  ui/screens/BookshelfScreen.tsx
  ui/screens/ChapterListScreen.tsx
  ui/screens/EditorScreen.tsx
  ui/screens/BookInfoScreen.tsx
  ui/screens/PreviewScreen.tsx
  app/bookService.ts                # create/import/openChapter/export
src/epub/*.test.ts
index.html
capacitor.config.ts
vite.config.ts
vitest.config.ts
```

In-app persistence uses IndexedDB (`idb`) so the web preview works without native Filesystem quirks. On Android the same IndexedDB lives in the WebView (app-private; cleared on uninstall), matching the spec. Save As still uses Capacitor Filesystem / download.

## Types (locked)

```ts
export type ChapterState = 'pristine' | 'simplified';

export interface ChapterIndex {
  id: string;
  href: string;
  title: string;
  spineIndex: number;
  state: ChapterState;
}

export interface BookRecord {
  id: string;
  title: string;
  author: string;
  language: string;
  updatedAt: string;
  coverPath?: string;
  sourceName?: string;
  chapters: ChapterIndex[];
}

export interface ParsedEpub {
  title: string;
  author: string;
  language: string;
  coverHref?: string;
  chapters: ChapterIndex[]; // all pristine
  entries: Map<string, Uint8Array>; // zip paths, normalized, no leading ./
  navHref?: string;
  opfHref: string;
}

export interface TiptapDoc {
  type: 'doc';
  content?: TiptapNode[];
}

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string }[];
  text?: string;
  content?: TiptapNode[];
}
```

Chinese errors: `不是有效的 EPUB 文件` / `找不到书籍目录（OPF）` / `这本书没有可编辑的章节` / `不支持加密的 EPUB` / `文件已损坏`.

---

### Task 1: Scaffold Vite + React + TS + Capacitor + Vitest

**Files:** `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `index.html`, `capacitor.config.ts`, `src/main.tsx`

- [ ] **Step 1:** Create Vite React TS app in the existing repo (keep `docs/`). Install: `jszip`, `idb`, `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-placeholder`, `@tiptap/extension-heading`, `@capacitor/core`, `@capacitor/cli`, `@capacitor/filesystem`, `@capacitor/status-bar`, `@capacitor/android`, `vitest`, `happy-dom`, `@types/jszip` if needed.

- [ ] **Step 2:** `npx cap init 素笺 com.sujian.epubeditor --web-dir dist` then `npx cap add android`.

- [ ] **Step 3:** `npm test` and `npm run dev` scripts work. Commit if git identity exists; otherwise skip commits.

### Task 2: EPUB parse (TDD)

**Files:** `src/epub/errors.ts`, `src/epub/xml.ts`, `src/epub/paths.ts`, `src/epub/fixtures.ts`, `src/epub/parse.ts`, `src/epub/parse.test.ts`

- [ ] **Step 1:** Write tests that fail:
  - minimal EPUB 3 → title/author/language/chapter list
  - `encryption.xml` present → `encrypted`
  - garbage bytes → `not-zip` or `corrupt`
  - missing OPF → `no-opf`
  - empty spine → `empty-spine`
  - EPUB 2 with NCX still lists chapters
  - `linear="no"` items excluded

- [ ] **Step 2:** Run `npx vitest run src/epub/parse.test.ts` — FAIL (module missing).

- [ ] **Step 3:** Implement `parseEpub(buf: ArrayBuffer): Promise<ParsedEpub>` with JSZip + DOMParser. Spine items without `linear="no"` become chapters. Titles: nav → NCX → first heading → `第 N 章`.

- [ ] **Step 4:** Tests PASS.

### Task 3: Simplify XHTML → TipTap JSON (TDD)

**Files:** `src/epub/simplify.ts`, `src/epub/simplify.test.ts`

- [ ] **Step 1:** Tests:
  - `h1`–`h6`, `p`, `strong`/`b`, `em`/`i`, `ul`/`ol` map correctly
  - `a` unwraps to text (no URL)
  - `table` cells become paragraphs
  - `script` dropped
  - `img src` resolved against chapter href via a provided `resolveSrc(src): { src: string }`

- [ ] **Step 2:** FAIL then implement `simplifyXhtml(xhtml: string, resolveHref: (src: string) => string): TiptapDoc`.

- [ ] **Step 3:** PASS.

### Task 4: Serialize TipTap → XHTML and pack EPUB 3 (TDD)

**Files:** `src/epub/serialize.ts`, `src/epub/serialize.test.ts`

- [ ] **Step 1:** Tests:
  - new book with one chapter + one image exports; zip has uncompressed `mimetype` first, `container.xml`, OPF version 3.0, `nav.xhtml`, cover-image property when cover set
  - three-chapter fixture: mark only chapter 2 simplified; exported files for chap 1 and 3 have identical bytes to original entries
  - add/delete/reorder chapters updates spine + nav
  - encrypted input never reaches pack (parse rejects)

- [ ] **Step 2:** Implement `packEpub(input: PackInput): Promise<Uint8Array>`.

`PackInput`: `book: BookRecord`, `entries: Map<string, Uint8Array>` original, `simplified: Map<chapterId, { xhtml: string; images: { id: string; href: string; bytes: Uint8Array; mime: string }[] }>`, optional cover bytes.

Pristine chapters: write original bytes at `href`. Simplified: write generated XHTML. Rebuild OPF + nav. Keep other original entries unless replaced.

- [ ] **Step 3:** PASS.

### Task 5: Image compress

**Files:** `src/images/compress.ts`, `src/images/compress.test.ts`

- [ ] **Step 1:** Test: 10×10 PNG blob round-trips; function returns `{ bytes, mime, ext }`. Skip real 2MB bitmap in CI; encode path is covered. Runtime still maxes longest side 1600px and 2MB.

- [ ] **Step 2:** Implement with `createImageBitmap` + canvas. Transparent PNG stays PNG; otherwise JPEG quality 0.85, reduce quality until under 2MB.

### Task 6: Workspace + book service

**Files:** `src/storage/idb.ts`, `src/storage/workspace.ts`, `src/storage/files.ts`, `src/app/bookService.ts`

- [ ] IndexedDB database `sujian` version 1: `books` (BookRecord), `entries` (key `bookId/path`), `docs` (key `bookId/chapterId` TipTap JSON), `blobs` (images/cover).
- [ ] `createBook()`, `importEpub(buf, sourceName)`, `listBooks()`, `deleteBook(id)`, `saveBook(record)`, `saveDoc`, `openChapterForEdit` (simplify + mark state), `exportEpub(bookId)`.
- [ ] `pickEpubFile()` / `pickImageFile()`: hidden `<input type="file">`, **no `capture` attribute**.
- [ ] `saveEpubToUser(filename, bytes)`: web → Object URL download; native → `Filesystem.writeFile({ directory: Directory.Documents })`.

### Task 7: UI (素笺)

Aesthetic: rice-paper cream `#efe6d4`, ink `#1c1410`, cinnabar `#9c2b1f`. Fonts: **ZCOOL XiaoWei** for the app name, **Noto Serif SC** for reading/editing, **Noto Sans SC** for chrome. Paper grain via SVG noise. No Inter/Roboto/purple gradients. Mobile-first, 44px targets, safe-area insets, toolbar sticky above editor; `visualViewport` padding when keyboard opens.

Screens:

1. Bookshelf — list, 新建书籍, 打开 EPUB, swipe/delete 删除应用内副本
2. Chapter list — titles, tap with confirm dialog for pristine, 新增/删除/排序, 书籍信息 / 预览 / 导出
3. Editor — TipTap, H1–H6, 正文, 粗体, 斜体, 列表, 插图, 撤销/重做, 800ms debounce autosave
4. Book info — title, author, language, cover picker
5. Preview — sequential chapters; simplified from JSON; pristine innerHTML sandboxed; fallback text + 「本章尚未编辑，预览可能不完整」

- [ ] Implement screens + `App.tsx` navigation state.
- [ ] Confirm dialog copy: 「进入编辑后，这一章的原始排版无法完整保留。」 取消 / 确认编辑

### Task 8: Wire Capacitor Android + verify

- [ ] `npm run build` then `npx cap sync`
- [ ] `npx vitest run` all green
- [ ] `npm run build` exit 0
- [ ] Manual: `npm run dev` — bookshelf, create, edit, export download

---

## Spec coverage

| Spec | Task |
|---|---|
| Capacitor-first + web preview | 1, 8 |
| Create + open + export EPUB 3 | 2, 4, 6 |
| Chapter hybrid byte-identical | 4 |
| Warn before simplify | 7 |
| Bookshelf + Save As; in-app disposable | 6, 7 |
| No camera; image compress ~2MB | 5, 6 |
| Headings, lists, bold/italic, undo | 7 |
| Add/delete/reorder; metadata/cover | 4, 6, 7 |
| DRM reject | 2 |
| Chinese UI, mobile-first, preview | 7 |
| Autosave, no chapter save button | 7 |

Out of scope remains as in the spec (tables-as-structure, links, DRM, EPUB 2 export, camera).
