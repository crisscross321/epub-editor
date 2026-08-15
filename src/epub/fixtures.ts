import JSZip from 'jszip'
import { escapeXml } from './xml'

export async function zipEpub(files: { path: string; data: string | Uint8Array; store?: boolean }[]): Promise<Uint8Array> {
  const zip = new JSZip()
  for (const file of files) {
    zip.file(file.path, file.data, {
      compression: file.store ? 'STORE' : 'DEFLATE',
    })
  }
  return zip.generateAsync({ type: 'uint8array', mimeType: 'application/epub+zip' })
}

export function containerXml(opfHref: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="${escapeXml(opfHref)}" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
}

export function xhtmlChapter(title: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN" lang="zh-CN">
<head><title>${escapeXml(title)}</title></head>
<body>
${body}
</body>
</html>`
}

export async function fixtureEpub3(options?: {
  title?: string
  author?: string
  language?: string
  chapters?: { id: string; title: string; body: string }[]
  encrypted?: boolean
  skipOpf?: boolean
  emptySpine?: boolean
  linearNoExtra?: boolean
}): Promise<Uint8Array> {
  const title = options?.title ?? '测试书'
  const author = options?.author ?? '作者甲'
  const language = options?.language ?? 'zh-CN'
  const chapters = options?.chapters ?? [
    { id: 'ch1', title: '第一章', body: '<h1>第一章</h1><p>甲章正文 UNIQUE_ONE</p>' },
    { id: 'ch2', title: '第二章', body: '<h1>第二章</h1><p>乙章正文 UNIQUE_TWO</p>' },
    { id: 'ch3', title: '第三章', body: '<h1>第三章</h1><p>丙章正文 UNIQUE_THREE</p>' },
  ]

  const files: { path: string; data: string | Uint8Array; store?: boolean }[] = [
    { path: 'mimetype', data: 'application/epub+zip', store: true },
    { path: 'META-INF/container.xml', data: containerXml('OEBPS/content.opf') },
  ]

  if (options?.encrypted) {
    files.push({
      path: 'META-INF/encryption.xml',
      data: '<?xml version="1.0"?><encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:enc:1.0"/>',
    })
  }

  if (!options?.skipOpf) {
    const manifestItems = chapters
      .map(
        (ch) =>
          `    <item id="${ch.id}" href="text/${ch.id}.xhtml" media-type="application/xhtml+xml"/>`,
      )
      .join('\n')
    const extraManifest = options?.linearNoExtra
      ? `\n    <item id="notes" href="text/notes.xhtml" media-type="application/xhtml+xml"/>`
      : ''
    const spine = options?.emptySpine
      ? ''
      : chapters.map((ch) => `    <itemref idref="${ch.id}"/>`).join('\n') +
        (options?.linearNoExtra ? `\n    <itemref idref="notes" linear="no"/>` : '')

    const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bid" version="3.0" xml:lang="${language}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bid">urn:uuid:test-book</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>${escapeXml(language)}</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${manifestItems}${extraManifest}
  </manifest>
  <spine>
${spine}
  </spine>
</package>`
    files.push({ path: 'OEBPS/content.opf', data: opf })

    const navLis = chapters
      .map((ch) => `      <li><a href="text/${ch.id}.xhtml">${escapeXml(ch.title)}</a></li>`)
      .join('\n')
    files.push({
      path: 'OEBPS/nav.xhtml',
      data: xhtmlChapter(
        '目录',
        `<nav epub:type="toc" xmlns:epub="http://www.idpf.org/2007/ops"><ol>\n${navLis}\n      </ol></nav>`,
      ),
    })
  }

  for (const ch of chapters) {
    files.push({
      path: `OEBPS/text/${ch.id}.xhtml`,
      data: xhtmlChapter(ch.title, ch.body),
    })
  }
  if (options?.linearNoExtra) {
    files.push({
      path: 'OEBPS/text/notes.xhtml',
      data: xhtmlChapter('注释', '<p>不应出现在章节列表</p>'),
    })
  }

  return zipEpub(files)
}

export async function fixtureEpub2Ncx(): Promise<Uint8Array> {
  const opf = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bid" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bid">id-2</dc:identifier>
    <dc:title>旧版书</dc:title>
    <dc:creator>乙</dc:creator>
    <dc:language>zh</dc:language>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="c1"/>
  </spine>
</package>`
  const ncx = `<?xml version="1.0"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="n1">
      <navLabel><text>NCX标题</text></navLabel>
      <content src="c1.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`
  return zipEpub([
    { path: 'mimetype', data: 'application/epub+zip', store: true },
    { path: 'META-INF/container.xml', data: containerXml('OEBPS/content.opf') },
    { path: 'OEBPS/content.opf', data: opf },
    { path: 'OEBPS/toc.ncx', data: ncx },
    { path: 'OEBPS/c1.xhtml', data: xhtmlChapter('忽略', '<p>正文</p>') },
  ])
}
