---
title: 素笺优化清单
date: 2026-09-01
type: 代码评审 / 优化清单
scope: 移动端 EPUB 编辑器（Capacitor + React + TipTap）
author: WorkBuddy
---

# 素笺优化清单

> 目标：以「做一个移动端的好用工具」为核心，从项目完整性角度梳理待优化项，按「能力补全」与「工程优化」两类分开列。
> 本次评审只做清单，不改代码。

## 背景

项目当前状态（评审时点）：

- 架构为三层：数据层（IndexedDB + Capacitor Filesystem）、引擎层（EPUB 解析 / 简化 / 打包）、UI 层（React）
- 单元测试 99 条全绿（28 个测试文件，Vitest + happy-dom）
- Capacitor 已能打出 APK（debug 包，4.7 MB）
- 源码约 83 个文件，60 个 `.ts` + 22 个 `.tsx`

---

## 结论先行

项目骨架是完整的：三层架构清晰、EPUB 引擎有单测覆盖、移动端打包链路已通。但从「移动端好用工具」看，有三处硬伤。

1. **真机编辑器是另一套实现。** `EditorScreen.tsx:27` 按 platform 分流，Android 走 `SimpleEditor`（contentEditable + 已废弃的 `execCommand`），浏览器里跑的 TipTap 逻辑在手机上基本不生效；且 `SimpleEditor.tsx:169` 的大纲按钮 `onClick` 是空壳。
2. **进出系统的数据通道只做了一半。** 能选文件导入、能分享导出，但不能被别的 App 唤起、不能存到固定目录、没有整架备份。
3. **切后台会丢字。** 800 ms 防抖自动保存，全项目没有任何 `visibilitychange` / `appStateChange` / `pagehide` 的落盘兜底。

第 3 点建议排在最前面：用户打完字按 Home 键，系统回收 WebView，最后一段输入就没了。这是移动端工具的底线问题。

### 数据通道现状（能力缺口最集中的地方）

| 通道 | 现状 | 缺口 |
|---|---|---|
| 导入 | 系统文件选择器，支持 epub / txt / md / 图片 | 无 |
| 导出 | 写 `Directory.Cache` 再调系统 Share | 不能落固定目录；Cache 会被系统清理；取消分享无兜底 |
| 被唤起 | 无 | 缺 `ACTION_VIEW` / `ACTION_SEND` + `application/epub+zip`（A3） |
| 备份 | 无 | 缺整架备份 / 恢复（A5） |

---

## A. 能力补全（用户能感知到的功能缺失）

### P0 — 影响「敢不敢用」

| # | 问题 | 证据 | 说明 |
|---|---|---|---|
| A1 | **切后台 / 杀进程会丢字** | 全项目无 `visibilitychange` / `appStateChange` / `pagehide` 监听 | 只有 800 ms 防抖（`App.tsx:323`）和 `leaveEditor` 时保存。用户打完字直接按 Home，系统回收 WebView，最后一段输入就没了 |
| A2 | **真机与浏览器是两套编辑器** | `EditorScreen.tsx:27` 按 platform 分流 | Android 走 `SimpleEditor`（contentEditable + 已废弃的 `execCommand`），浏览器里调试的 TipTap 逻辑在真机全部不生效。且 `SimpleEditor.tsx:169` 的大纲按钮 `onClick` 是空的，点了没反应 |
| A3 | **不能被别的 App 唤起** | `AndroidManifest.xml` 只有 MAIN / LAUNCHER | 没有 `ACTION_VIEW` / `ACTION_SEND` + `application/epub+zip`。从微信、文件管理器点一个 epub 选「素笺」，打不开 |
| A4 | **导出不能落到固定目录** | `files.ts:61-82` 写 `Directory.Cache` 再 `Share` | Cache 会被系统清理；Share 被取消只回一句「请再点一次导出」。设计文档第 5 节写的是 `Directory.Documents`，实现不符。Android 10+ 需要 MediaStore 或 SAF |
| A5 | **没有整架备份 / 恢复** | `bookService` 只有单本导出 | 现在只能一本本导出 EPUB / TXT / MD。pristine 原文件、笔记、章节顺序、封面都无法整体带走。README 明说卸载即丢，却不给备份手段 |

### P1 — 影响「用得顺不顺」

| # | 问题 | 证据 |
|---|---|---|
| A6 | 删书只有 10 秒撤销，没有回收站 | `App.tsx:543` 定时 purge。10 s 内进程被杀 → TrashDump 永久滞留 IDB 且启动时无清理扫描；超时后彻底找不回 |
| A7 | 全书搜索能搜不能定位 | `PreviewScreen.tsx:319` 点结果只切章节，不跳转、不高亮；pristine 章节的偏移与正文对不上 |
| A8 | 划线不回显 | 能存 `highlight` 类型笔记（notes 面板可读），但阅读页不渲染划线。`highlightQuery` 只服务搜索词 |
| A9 | 用 `window.prompt` 做输入 | `PreviewScreen.tsx:262`（写笔记）、`App.tsx:637`（移到第 N 章）。WebView 里体验差、部分 ROM 会禁用、无法多行 |
| A10 | 章节排序只有 ↑↓ 按钮 | 设计规范 4.2 写的是「拖动排序」。长书重排是灾难 |
| A11 | 删章不可撤销 | `deleteChapter` 直接删 doc + entry，没有像删书那样的 undo |
| A12 | 导入 / 导出无进度反馈 | `setBusy` 只显示「处理中…」。大书在手机上解包打包要好几秒，没百分比也没取消 |
| A13 | 无存储配额处理 | 设计规范第 10 节要求「空间不足 → 提示并保留内存内容」。现在没捕获 `QuotaExceededError`，写入失败走的是泛化文案 |

### P2 — 锦上添花

| # | 问题 |
|---|---|
| A14 | `BookRecord` 里有 `series` / `tags` / `publisher` / `language`，`BookInfoScreen` 没暴露；导入书的 language 错了也改不了 |
| A15 | 无全字数统计、无「还有 N 章未编辑」提示、SimpleEditor 大纲跳转为空 |
| A16 | `checkExport` 太粗：不校验 nav 与 spine 一致性、不检查悬空 imageId（blobs 里没有时 src 会变空） |
| A17 | 翻页模式不恢复页内阅读位置（`PreviewScreen.tsx:89` 只在 `!paged` 时恢复） |
| A18 | 导出包无自检，mimetype 首条 + STORE 已做到，但没有完整性校验 |

---

## B. 工程优化（用户看不见，但决定能不能长期维护）

### P0

| # | 问题 | 证据 | 说明 |
|---|---|---|---|
| B1 | **`App.tsx` 是 730 行上帝组件** | — | 同时承担路由、6 个屏幕的全部状态、保存防抖、撤销计时、对话框、导出流程。建议按域拆 hook：`useBookshelf` / `useBook` / `useEditorSession` / `useExport`，路由独立成模块 |
| B2 | **双编辑器 = 双份维护、一份测试** | `SimpleEditor` 无对应 `.test.tsx` | A2 统一路径后自动消解 |
| B3 | **整本书常驻内存** | `bookService.ts:351` `getAllEntries` 一次读全部；`:110` 逐条 `await putEntry`，每条一个事务 | 设计文档第 14 节明确点了这个风险（「避免整本进内存」）。手机上大书会 OOM。应改单事务批量写 + 按条流式读写 |
| B4 | **Blob URL 泄漏** | 全项目只有 1 处 `revokeObjectURL`（`files.ts:91`） | `coverUrl` / `hydrateDocImages` / `blobUrlFor` 每次调用都新建 `blob:` URL（`bookService.ts:241, 248`）。每次 `refreshShelf` 给每本书重建封面 URL，翻几次章节就累积上百个未释放引用 |
| B5 | **无 lint / 无格式化 / 无 CI** | 代码里有 `eslint-disable` 注释却没有 eslint 配置 | 也没有 prettier、editorconfig、husky、GitHub Actions。99 个单测全绿，但没人保证新代码风格一致 |
| B6 | **测试全是单元级，无端到端** | 28 个测试文件都是纯函数 / 单组件 | 缺「新建 → 打字 → 插图 → 预览 → 导出 → 重新导入」的闭环回归。Vitest + happy-dom 已装，缺的是集成测试与覆盖率门槛 |

### P1

| # | 问题 |
|---|---|
| B7 | 自动保存有竞态：`leaveEditor` 清 timer 后直接 `saveDoc`，若上一次 `saveDoc` 还在飞，两次写同一 chapterId 会互相覆盖；无失败重试 / 暂存队列 |
| B8 | H1 自动拆章逻辑埋在保存路径里（`bookService.ts:150-184`），会静默新建章节并通过 `focusChapterId` 反向驱动 UI 路由。建议显式化为一次「拆章」事务并在 UI 上告知 |
| B9 | 状态分层不一致：设置在 localStorage（`settings.ts`），书在 IndexedDB。备份迁移要处理两套，WebView 里两者被清理的时机也不同 |
| B10 | DB 无启动清理任务：过期 trash、已删书残留的 blobs / annotations、悬空 imageId 都没人收 |
| B11 | 无本地错误日志：`ErrorBoundary` 只 `console.error`。真机白屏无从查起，建议加应用内「最近错误」或日志导出 |
| B12 | `ParsedEpub.entries`（`Map<string, Uint8Array>`）和 `TrashDump` 直接塞进 IndexedDB，序列化行为依赖浏览器实现，建议统一序列化边界 |

### P2

| # | 问题 |
|---|---|
| B13 | Android 工程未产品化：`versionCode` 仍是 1、无 `signingConfig`（release/ 是 debug 包）、`minifyEnabled false`、图标疑似 Capacitor 默认、`allowBackup="true"` 与「卸载即丢」的文案不自洽 |
| B14 | 装了 5 个 `@tiptap/*` 但 Android 上根本不用。若统一到 SimpleEditor 路线可全部移除，APK 显著瘦身（当前 4.7 MB）；反之需先解决 TipTap 在移动端 WebView 的输入法兼容 |
| B15 | `loadSettings` 只做浅合并，无 schema version 与迁移，字段改名后旧数据会留脏值 |
| B16 | 触控尺寸不达标：`index.css` 有 44 px 的 `min-height`，但 `btn-compact` / `icon-btn` 出现 32 px、40 px（`:182, :257, :552`），低于设计规范 44 px 要求 |
| B17 | 文档与实现脱节：`docs/superpowers/specs` 状态仍写「待实现」，功能已上线；其中「存到 Directory.Documents」「拖动排序」两条与实际不符。README 也没写已上线的「导入文稿」「合并章节」「全书替换」 |

---

## 建议的动手顺序

### 第一批：先把数据安全的底兜住

A1 落盘兜底 → A5 整架备份 → B4 Blob 泄漏 → B3 内存与批量写

这四件事做完，这个工具才「敢用」。

### 第二批：决定技术路线

A2 + B2 + B14 其实是一件事——先定「统一到 TipTap」还是「统一到 SimpleEditor」。

倾向先确认 TipTap 在目标机型 WebView 上的中文输入法表现，再决定，否则容易返工。

### 第三批：补外部通道

A3 Intent 过滤 + A4 固定目录导出。

这两项让素笺真正接入手机的文件生态。

### 第四批：体验与工程化

A6–A13、B1、B5、B6。

---

## 附：评审覆盖的文件

- `src/App.tsx`、`src/types/book.ts`
- `src/app/bookService.ts`
- `src/storage/settings.ts`、`src/storage/files.ts`、`src/storage/idb.ts`
- `src/epub/parse.ts`、`src/epub/serialize.ts`、`src/epub/exportCheck.ts`
- `src/ui/screens/`：`EditorScreen`、`SimpleEditor`、`PreviewScreen`、`BookshelfScreen`、`ChapterListScreen`、`SettingsScreen`、`Onboarding`
- `src/ui/ErrorBoundary.tsx`、`src/index.css`、`src/polyfills.ts`
- `index.html`、`capacitor.config.ts`、`package.json`、`README.md`
- `android/app/build.gradle`、`android/variables.gradle`、`android/app/src/main/AndroidManifest.xml`
- `docs/superpowers/specs/2026-08-15-epub-editor-design.md`、`docs/superpowers/plans/2026-08-15-epub-editor.md`
