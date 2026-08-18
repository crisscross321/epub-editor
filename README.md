# 素笺

在手机上编辑 EPUB 的本地编辑器。可以新建一本书，也可以打开已有 `.epub`，改完导出为 EPUB 3。

全部跑在客户端，没有后端。卸载应用或清除站点数据后，书架里的书会丢失；另存到系统目录的文件才是备份。

## 能做什么

- 书架：新建书籍、打开 EPUB、删除存档
- 书籍信息：书名、作者、封面、章节增删与排序
- 正文编辑：H1–H3、正文、粗体/斜体、列表、插图、查找替换、撤销重做
- 阅读预览：按章节浏览
- 导出 EPUB 3

打开已有书时，**没打开过的章节会按原文件字节打回包**；第一次进入某章编辑前会提示：该章排版会被简化，确认后才转换。

## 明确不做

表格、脚注、公式、链接、自定义 CSS、加密/DRM EPUB、云同步。导出统一为 EPUB 3（打开 EPUB 2 可以）。

## 开发

需要 Node.js 18+。

```bash
npm install
npm run dev      # 浏览器预览界面
npm test         # 单元测试
npm run build    # 生产构建
```

浏览器里可以看界面和编辑逻辑。打开真实文件、另存为、真机键盘与安全区，请用 Android 调试。

## Android

这是 Capacitor 工程，原生壳在 `android/`。

```bash
npm run cap:sync          # 构建网页并同步到 Android 工程
npx cap open android      # 用 Android Studio 打开、安装到手机
```

应用 ID：`com.sujian.epubeditor`。
