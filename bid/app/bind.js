// 成册：连续页码 + 目录页 + PDF 书签
// 依赖 pdf-lib（由 sync-engine.sh 从 PDF 口袋同步）

export const PAGE_TEMPLATES = {
  n:        (n, total) => `${n}`,
  dash:     (n) => `- ${n} -`,
  zh:       (n) => `第 ${n} 页`,
  zhTotal:  (n, total) => `第 ${n} 页 共 ${total} 页`,
  slash:    (n, total) => `${n} / ${total}`,
};

export const SIZES = { xiaowu: 9, wuhao: 10.5, xiaosi: 12 };
export const cm = (v) => v * 28.3465; // cm → pt

function numText(fmt, n, total) {
  const f = PAGE_TEMPLATES[fmt] || PAGE_TEMPLATES.n;
  return f(n, total);
}

/**
 * 加连续页码。
 * opts: { format='n', size=10.5, font='TimesRoman', pos='footer-center',
 *         startAt=1, skipFirst=0, skipBlankPages=false, edge=1.2 } // edge: 距边 cm
 */
export async function addPageNumbers(doc, opts = {}) {
  const { StandardFonts, rgb } = await import('./pdf-lib.esm.min.js');
  const o = {
    format: 'n', size: SIZES.wuhao, font: 'TimesRoman', pos: 'footer-center',
    startAt: 1, skipFirst: 0, skipBlankPages: false, edge: 1.2, ...opts,
  };
  const font = o.fontObj || await doc.embedFont(StandardFonts[o.font] || StandardFonts.TimesRoman);
  const pages = doc.getPages();
  const total = pages.length - o.skipFirst;
  let counted = 0;
  pages.forEach((page, i) => {
    if (i < o.skipFirst) return;
    counted += 1;
    const label = numText(o.format, o.startAt + counted - 1, o.startAt + total - 1);
    const { width, height } = page.getSize();
    const w = font.widthOfTextAtSize(label, o.size);
    const h = font.heightAtSize(o.size);
    const edge = cm(o.edge);
    let x, y;
    if (o.pos === 'footer-right') { x = width - edge - w; y = edge; }
    else if (o.pos === 'footer-left') { x = edge; y = edge; }
    else if (o.pos === 'header-center') { x = (width - w) / 2; y = height - edge - h; }
    else { x = (width - w) / 2; y = edge; }
    page.drawText(label, { x, y, size: o.size, font, color: rgb(0, 0, 0) });
  });
  return { counted, total };
}

/**
 * 在 tocAt 处插入目录页（可多页）。
 * chapters: [{ title, level=1, page }]  page 为**原文档**里的 0 基页码
 * 返回 { tocPages, chapters: 修正后的章节（page 已加上插入偏移）}
 */
export async function insertToc(doc, chapters, opts = {}) {
  const { StandardFonts, rgb } = await import('./pdf-lib.esm.min.js');
  const o = { tocAt: 1, title: '目  录', size: 11, line: 26, dot: true, cjk: false, fontBytes: null, ...opts };
  const fontObj = opts.fontObj || await fontFor(doc, { cjk: o.cjk, bytes: o.fontBytes });
  const reg = fontObj;
  const bold = opts.boldFontObj || fontObj;
  const cjk = await doc.embedFont(StandardFonts.Helvetica); // 拉丁兜底；中文标题由页面原字体决定
  const { width, height } = doc.getPage(0).getSize();
  const marginX = cm(2.2);
  const top = height - cm(3.2);
  const perPage = Math.floor((top - cm(2.4)) / o.line);
  const need = Math.ceil((chapters.length + 3) / perPage) || 1;

  // 先算插入后每章的真实页码
  const shifted = chapters.map((c) => ({
    ...c,
    page: c.page >= o.tocAt ? c.page + need : c.page,
  }));

  let idx = 0;
  for (let p = 0; p < need; p++) {
    const page = doc.insertPage(o.tocAt + p, [width, height]);
    let y = top;
    if (p === 0) {
      const t = o.title;
      page.drawText(t, { x: (width - reg.widthOfTextAtSize(t, 16)) / 2, y, size: 16, font: reg, color: rgb(0, 0, 0) });
      y -= o.line * 1.6;
    }
    for (let k = 0; k < perPage && idx < shifted.length; k++, idx++) {
      const c = shifted[idx];
      const indent = (c.level - 1) * 14;
      const label = c.title;
      const pageNo = String(c.page + 1);
      const f = c.level === 1 ? bold : reg;
      const size = o.size - (c.level - 1) * 1;
      page.drawText(label, { x: marginX + indent, y, size, font: f, color: rgb(0, 0, 0) });
      const pw = f.widthOfTextAtSize(pageNo, size);
      page.drawText(pageNo, { x: width - marginX - pw, y, size, font: f, color: rgb(0, 0, 0) });
      if (o.dot) {
        const startX = marginX + indent + f.widthOfTextAtSize(label, size) + 6;
        const endX = width - marginX - pw - 6;
        if (endX > startX) {
          const dots = '.'.repeat(Math.max(3, Math.floor((endX - startX) / (size * 0.28))));
          page.drawText(dots, { x: startX, y, size, font: reg, color: rgb(0.45, 0.45, 0.45) });
        }
      }
      y -= o.line;
    }
  }
  return { tocPages: need, chapters: shifted };
}

/**
 * 写 PDF 书签（/Outlines）。chapters 的 page 为最终 0 基页码。
 */
export function setOutline(doc, chapters) {
  if (!chapters.length) return 0;
  const { PDFArray, PDFDict, PDFName, PDFNumber, PDFHexString } = requirePdfLib();
  const ctx = doc.context;
  const refs = chapters.map(() => ctx.nextRef());
  const rootRef = ctx.nextRef();

  chapters.forEach((c, i) => {
    const m = new Map();
    m.set(PDFName.of('Title'), PDFHexString.fromText(c.title));
    m.set(PDFName.of('Parent'), rootRef);
    const dest = PDFArray.withContext(ctx);
    dest.push(doc.getPage(c.page).ref);
    dest.push(PDFName.of('Fit'));
    m.set(PDFName.of('Dest'), dest);
    if (i > 0) m.set(PDFName.of('Prev'), refs[i - 1]);
    if (i < chapters.length - 1) m.set(PDFName.of('Next'), refs[i + 1]);
    ctx.assign(refs[i], PDFDict.fromMapWithContext(m, ctx));
  });

  const root = new Map();
  root.set(PDFName.of('Type'), PDFName.of('Outlines'));
  root.set(PDFName.of('First'), refs[0]);
  root.set(PDFName.of('Last'), refs[refs.length - 1]);
  root.set(PDFName.of('Count'), PDFNumber.of(chapters.length));
  ctx.assign(rootRef, PDFDict.fromMapWithContext(root, ctx));
  doc.catalog.set(PDFName.of('Outlines'), rootRef);
  return chapters.length;
}


/**
 * 取字体：cjk=true 时嵌入 Noto Sans SC（需传入字体字节），否则用内置 Helvetica。
 * pdf-lib 的 StandardFonts 是 WinAnsi 编码，画不了中文，所以中文必须走嵌入字体。
 */
export async function fontFor(doc, { cjk = false, bytes = null } = {}) {
  await loadPdfLib();
  const { PDFDocument, StandardFonts } = requirePdfLib();
  if (!cjk) return doc.embedFont(StandardFonts.Helvetica);
  if (!bytes) throw new Error('中文需要字体字节（NotoSansSC-Regular.otf）');
  const fontkit = (await import('./vendor/fontkit.es.min.js')).default;
  if (typeof PDFDocument.prototype.registerFontkit === 'function' && !PDFDocument.__fontkitReady) {
    PDFDocument.prototype.registerFontkit(fontkit);
    PDFDocument.__fontkitReady = true;
  }
  return doc.embedFont(bytes, { subset: true });
}

// pdf-lib 的低层类在 ESM 里通过动态 import 拿，这里缓存一份
let _lib = null;
function requirePdfLib() {
  if (!_lib) throw new Error('pdf-lib 尚未加载：请先 await loadPdfLib()');
  return _lib;
}
export async function loadPdfLib() {
  if (!_lib) _lib = await import('./pdf-lib.esm.min.js');
  return _lib;
}
