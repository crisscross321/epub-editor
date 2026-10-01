# BYOK 纯客户端接入 LLM 可行性分析

日期：2026-08-31
问题：不搭服务器，用户自备 Key，能否实现 AI 功能？
结论：**能。且不需要新增任何依赖。**

---

## 一、结论先行

| 项 | 结论 |
|---|---|
| 需要自建服务器吗 | **不需要** |
| 需要新增依赖吗 | **不需要**，`@capacitor/core@7.6.8` 已内置所需能力 |
| 需要改原生代码吗 | 不需要写 Java，只需改 `capacitor.config.ts` 和网络安全配置 |
| 主要技术障碍 | CORS —— 已有现成解法 |
| 必须放弃的东西 | **流式输出（打字机效果）** |
| 主要风险 | Key 存在客户端，安全责任转移给用户；需明确告知 |

---

## 二、核心障碍：CORS，以及为什么它不是问题

### 障碍是什么

素笺是 WebView 应用，JS 里 `fetch('https://api.某模型服务.com/v1/chat/completions')` 会受同源策略约束。而绝大多数模型服务**不为浏览器直连下发 CORS 响应头**（这是刻意的 —— 他们不希望 Key 出现在前端）。

结果：浏览器里直连必然失败，报 CORS 错误。这是所有"纯前端接 LLM"方案撞的第一道墙，也是很多人误以为"必须自建代理"的原因。

### 解法：Capacitor 原生 HTTP 通道

已在本地验证 `@capacitor/core@7.6.8` 导出了 `CapacitorHttp`：

```
node_modules/@capacitor/core/types/index.d.ts:4
export { CapacitorCookies, CapacitorHttp, WebView, buildRequestInit } from './core-plugins';
```

它的原理是：请求不走 WebView 的网络栈，而是通过 Capacitor Bridge 交给**原生层（Android 用 Java HTTP 客户端）**发出。原生 HTTP 客户端没有同源策略这个概念，**CORS 完全不适用**。

接口（`core-plugins.d.ts` 实测）：

```ts
CapacitorHttp.post({
  url: string,
  headers?: { [k: string]: string },
  data?: any,
  connectTimeout?: number,
  readTimeout?: number,
  responseType?: 'json' | 'text' | 'arraybuffer' | 'blob' | 'document',
}): Promise<{ data: any; status: number; headers: HttpHeaders; url: string }>
```

两种用法：

**方式 A（推荐）** —— 显式调用，不影响其他代码：

```ts
import { CapacitorHttp } from '@capacitor/core'
const res = await CapacitorHttp.post({ url, headers, data })
```

**方式 B** —— 在 `capacitor.config.ts` 里开全局补丁：

```ts
plugins: {
  CapacitorHttp: { enabled: true }
}
```

开启后 Capacitor 会**接管全局 `fetch` 和 `XMLHttpRequest`**（`@capacitor/cli` 声明文件原文：*"Enable CapacitorHttp to override the global `fetch` and `XMLHttpRequest` on native"*，默认 `false`）。

**建议选 A。** 理由：方式 B 是全局侵入，会影响 WebView 里所有网络行为（包括未来可能引入的任何三方库），排查问题时很难定位。素笺只有一处需要联网，没必要动全局。

---

## 三、必须放弃的：流式输出

这是整个方案唯一的实质性代价，需要正视。

`CapacitorHttp` 的返回类型是 `Promise<HttpResponse>` —— **一次性返回完整响应体**。它无法把 SSE（`text/event-stream`）逐块推给 JS。所以做不了打字机效果。

### 但这恰好和素笺的设计是自洽的

回看 `LLM-DESIGN-2026-08-31.md` 定的方向：**LLM 在素笺里是校对员，不是代笔**。

- **校对助手** 要返回结构化 JSON（问题清单）。JSON 必须完整才能解析，流式毫无意义 —— 你不能解析半个 JSON。
- **章节命名** 返回 3 个候选词，总共十几个字。流式没有价值。
- **摘要** 一两句话。同上。
- **一致性检查** 本来就设计成"后台任务，回来看报告"形态。
- **选区改写** 是唯一会因为没有流式而体验稍差的功能 —— 但它返回的也只是一段话，等 2-3 秒可接受。

真正需要流式的是「AI 续写整章」这类长文本生成 —— 而这一项在设计文档里已经**明确列为不做**。

所以结论是：**放弃流式不是妥协，而是和产品定位一致的选择。** 用一个体面的加载态（"正在检查第 3 / 12 段"）就够了。

---

## 四、开发环境怎么办

原生通道只在真机/模拟器上有效。`npm run dev` 在浏览器里跑，`CapacitorHttp` 会退化成 Web 实现（`CapacitorHttpPluginWeb`），底层还是 `fetch` —— **CORS 照旧拦截**。

三个选项：

| 方案 | 说明 | 建议 |
|---|---|---|
| Vite dev proxy | 在 `vite.config.ts` 加 `server.proxy`，把 `/llm` 转发到目标 API | **推荐**，零成本，只在 dev 生效，不进产物 |
| Base URL 指向本地代理 | 用户可配置 Base URL，dev 时填本地地址 | 可作补充 |
| 只在真机测 AI 功能 | 逻辑用单测覆盖，联调走真机 | 配合前两者 |

关键点：**Base URL 必须做成可配置项**（这本来就是 BYOK 的必需功能，用于支持各家兼容端点和中转服务）。这个设计顺便解决了 dev 环境问题，一举两得。

注意 `vite.config.ts` 当前只有 3 行，加 proxy 是纯增量改动，不影响现有构建。

---

## 五、Key 存哪里，以及必须说清的安全边界

### 存储

Key 存本地即可 —— `localStorage`（跟 `settings.ts` 一致）或 IDB 单独 store。

**不要试图"加密"它。** 纯客户端应用里，加密密钥自己也得存在客户端，这是循环依赖，只能防好奇不能防攻击。假装加密反而给用户虚假的安全感，比老实说明更糟。

### 必须明确告知用户的三件事

1. **Key 只存在这台手机上，素笺不上传、不经过任何中间服务器。** 这是 BYOK 相对官方代理的核心优势，应当作为卖点讲清楚。
2. **请求直接发往用户填写的地址。** 因此 Base URL 填错或填了恶意地址，正文内容会发到那里 —— 责任边界在用户。
3. **费用由用户自己承担，素笺不控制额度。** 建议在设置里显示本次会话累计发送字数，让消耗可见。

### 建议加一层域名约束

Android 需要网络安全配置。可以顺便做一件事：**给 Base URL 加一个白名单/确认机制** —— 用户填了预设列表之外的地址时，弹一次确认说明风险。既提升安全性，也是一次诚实的告知。

---

## 六、需要改动的清单

| 文件 | 改动 | 说明 |
|---|---|---|
| `src/llm/client.ts` | 新增 | 封装 `CapacitorHttp`，统一超时/重试/错误映射 |
| `src/llm/errors.ts` | 新增 | 仿 `epub/errors.ts` 的 `EpubError` 模式，做 `LlmError` + 中文文案 |
| `src/llm/config.ts` | 新增 | Base URL / 模型名 / Key 的读写，含预设列表 |
| `src/storage/settings.ts` | 修改 | 加 AI 相关设置项 |
| `src/ui/screens/SettingsScreen.tsx` | 修改 | 新增「AI 助手」配置区块 |
| `vite.config.ts` | 修改 | 加 dev proxy |
| `android/app/src/main/res/xml/` | 新增 | 网络安全配置，限制可访问域名 |
| `capacitor.config.ts` | 可能不改 | 若用方式 A 则无需改动 |

**`AndroidManifest.xml` 不需要加权限** —— `INTERNET` 已经在第 41 行了（实测确认）。

零新增 npm 依赖。

---

## 七、错误处理要覆盖的场景

BYOK 模式下失败原因比自建服务多，每种都要有中文提示，且**都不能影响正在进行的编辑**：

| 场景 | 提示方向 |
|---|---|
| 未配置 Key | 引导去设置，不报错 |
| Key 无效 / 401 | 「密钥无效或已过期，请检查设置」 |
| 余额不足 / 429 | 「服务商返回额度不足或请求过于频繁」 |
| Base URL 填错 / DNS 失败 | 「连不上这个地址，请检查接口地址」 |
| 超时 | 「等待超时，可以重试或改用更快的模型」 |
| 返回不是合法 JSON | 「模型返回格式异常」+ 提供查看原始返回 |
| 模型名不存在 / 404 | 「服务商不认识这个模型名」 |
| 内容被安全策略拦截 | 原样转述服务商信息 |

关键原则：**错误信息要能让用户自己修好**。BYOK 模式下你无法替用户排查，所以提示必须指向具体的配置项。

---

## 八、一个额外好处

BYOK 其实比自建服务更适合素笺，不只是省成本：

- **定位一致** —— 素笺承诺"没有账号、没有云"。BYOK 下素笺依然没有服务器、不碰用户数据、不知道用户是谁。承诺没有被打破。
- **零运营负担** —— 不需要计费、风控、额度、客服、扩容。
- **用户自由** —— 想用哪家用哪家，想用本地模型（Ollama 之类填个本地地址）也行。
- **合规简单** —— 数据流向由用户自己决定，素笺不是数据处理者。

代价是门槛：普通用户不知道什么是 API Key。所以设置页需要一段面向新手的说明，以及至少一个预设服务商的完整填写示例。

---

## 九、落地建议

对应 `LLM-DESIGN-2026-08-31.md` 的第二步，拆成两个可独立验证的动作：

**动作一：通道打通（不含任何 AI 功能）**
- `src/llm/` 三个文件 + 设置页配置区
- 加一个「测试连接」按钮，成功返回模型名或简单回显即可
- dev proxy + Android 网络配置

这一步做完，等于验证了"不搭服务器也能连上模型"这个前提。**它是可独立交付的**，且失败了也不影响素笺任何现有功能。

**动作二：第一个 AI 功能**
- 章节命名与摘要（输出短、易验证、猜错无损失）
- 用它跑通错误处理和加载态

之后再上建议层和校对助手。

---

## 附：实测记录

以下事实均在本机 `epub-editor` 项目内验证，非推测：

- `@capacitor/core` 版本 `7.6.8`，`types/index.d.ts` 第 4 行导出 `CapacitorHttp`
- `CapacitorHttpPlugin` 提供 `request/get/post/put/patch/delete`，返回 `Promise<HttpResponse>`，**无流式接口**
- `HttpOptions` 支持 `headers`、`data`、`connectTimeout`、`readTimeout`、`responseType`
- `@capacitor/cli` 声明文件确认 `plugins.CapacitorHttp.enabled` 默认 `false`，开启后会覆盖全局 `fetch` 与 `XMLHttpRequest`
- `AndroidManifest.xml` 第 41 行已有 `android.permission.INTERNET`
- 项目当前零网络代码（`fetch(` / `XMLHttpRequest` / `axios` / `EventSource` 全库无匹配）
- `android/app/src/main/res/xml/` 现有 `config.xml`、`file_paths.xml`，无网络安全配置
