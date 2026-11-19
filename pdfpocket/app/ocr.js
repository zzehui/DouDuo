// 可搜索 PDF（双层 OCR）：渲染每页 → 识别文字 → 把隐形文字垫在原图下面
// 全部在本地跑：pdf.js 渲染、tesseract 识别、pdf-lib 写回，不走任何网络请求。
import { PDFDocument, rgb } from './pdf-lib.esm.min.js';

const VENDOR = new URL('./vendor/', import.meta.url).href;
// pdf.js（1.4MB worker）与 fontkit（714KB）只在真正用到时才加载，首屏只依赖 pdf-lib
let _pdfjs = null;
async function getPdfjs() {
  if (!_pdfjs) {
    _pdfjs = await import('./vendor/pdfjs/pdf.min.mjs');
    _pdfjs.GlobalWorkerOptions.workerSrc = VENDOR + 'pdfjs/pdf.worker.min.mjs';
  }
  return _pdfjs;
}

const RENDER_SCALE = 2;        // ≈150dpi，够识别，内存可控
const MIN_FONT = 3.5;


/** 灰度 + Otsu 二值化 + 小图放大到 ~1400px 宽：扫描件对比度差时识别率提升明显 */
function prepCanvas(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width: W, height: H } = canvas;
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;

  const hist = new Uint32Array(256);
  const gray = new Uint8ClampedArray(W * H);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0;
    gray[j] = g; hist[g]++;
  }
  const total = W * H;
  let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = t; }
  }
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const v = gray[j] > thr ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

let _worker = null;
let _fontBytes = null;

async function getFont() {
  if (!_fontBytes) {
    const r = await fetch(VENDOR + 'font/NotoSansSC-Regular.otf');
    _fontBytes = new Uint8Array(await r.arrayBuffer());
  }
  return _fontBytes;
}

async function getWorker(langs, onProgress) {
  if (_worker) {
    const cur = _worker.__langs || '';
    if (cur === langs) return _worker;
    await _worker.terminate();
    _worker = null;
  }
  const w = await Tesseract.createWorker(langs, 1, {
    workerPath: VENDOR + 'tesseract/worker.min.js',
    corePath: VENDOR + 'tesseract/',
    langPath: VENDOR + 'tessdata',
    gzip: true,
    cacheMethod: 'none',
    logger: (m) => onProgress && onProgress(m),
  });
  w.__langs = langs;
  await w.setParameters({
    tessedit_pageseg_mode: '6',        // 整页当一块文本，书籍/合同效果最好
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
  });
  _worker = w;
  return w;
}

export async function terminate() {
  if (_worker) { try { await _worker.terminate(); } catch (e) {} _worker = null; }
}

/** 把 PDF 前 n 页的文字提出来，判断是不是扫描件 */
export async function detectScanned(bytes) {
  const doc = await (await getPdfjs()).getDocument({ data: bytes.slice(0) }).promise;
  const pages = Math.min(doc.numPages, 3);
  let chars = 0;
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    chars += tc.items.reduce((n, it) => n + (it.str || '').trim().length, 0);
  }
  const perPage = chars / pages;
  return { scanned: perPage < 20, chars: Math.round(perPage), pages: doc.numPages };
}

/**
 * 生成可搜索 PDF
 * @param {Uint8Array} bytes 原 PDF
 * @param {object} opts {langs:'chi_sim+eng', from:1, to:n, onProgress(p, total), onLog(m)}
 * @returns {Promise<Uint8Array>}
 */
export async function makeSearchable(bytes, opts = {}) {
  const { langs = 'chi_sim+eng', onProgress, onLog } = opts;
  const src = await (await getPdfjs()).getDocument({ data: bytes.slice(0) }).promise;
  const total = src.numPages;
  const from = Math.max(1, opts.from || 1);
  const to = Math.min(total, opts.to || total);

  const worker = await getWorker(langs, (m) => onLog && onLog(m));
  const fontBytes = await getFont();

  const stats = [];
  if (typeof window !== 'undefined') window.__ocrStats = stats;
  const out = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const fontkit = (await import("./vendor/fontkit.es.min.js")).default;
  PDFDocument.prototype.registerFontkit(fontkit);
  const font = await out.embedFont(fontBytes, { subset: true });

  let skipped = 0;
  for (let n = from; n <= to; n++) {
    if (typeof window !== 'undefined' && window.__ocrCancel) throw new Error('ocr-cancelled');
    const page = await src.getPage(n);
    try {
      const tc = await page.getTextContent();
      const has = tc.items.reduce((k, it) => k + (it.str || '').trim().length, 0);
      if (has >= 20) { skipped++; if (onProgress) onProgress(n - from + 1, to - from + 1); continue; }
    } catch (e) {}
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    prepCanvas(canvas);

    const { data } = await worker.recognize(canvas);

    // 按行重组文字：中文之间不留空格（否则搜「深入理解」搜不到），英文单词之间留一个
    const isCJK = (ch) => /[\u3400-\u9FFF\uF900-\uFAFF\u3000-\u303F\uFF00-\uFFEF]/.test(ch);
    const lines = (data.lines && data.lines.length)
      ? data.lines
      : (data.words || []).map((w) => ({ bbox: w.bbox, text: w.text }));

    const target = out.getPage(n - 1);
    const { width: pw, height: ph } = target.getSize();
    const sx = pw / canvas.width;
    const sy = ph / canvas.height;

    let wordsCharCount = 0, drawnCount = 0;
    for (const line of lines) {
      const words = (line.words || []).filter((w) => w.text && w.text.trim());
      let text;
      if (words.length) {
        text = '';
        for (let k = 0; k < words.length; k++) {
          const cur = words[k].text.trim();
          if (!cur) continue;
          if (!text) { text = cur; continue; }
          const prev = text[text.length - 1];
          const needSpace = !(isCJK(prev) || isCJK(cur[0]));
          text += (needSpace ? ' ' : '') + cur;
        }
      } else {
        text = (line.text || '').replace(/\s+/g, ' ').trim();
      }
      if (!text) continue;
      wordsCharCount += text.length;
      const b = line.bbox;
      const size = Math.max(MIN_FONT, (b.y1 - b.y0) * sy * 0.82);
      try {
        target.drawText(text, {
          x: b.x0 * sx,
          y: ph - b.y1 * sy,
          size, font,
          color: rgb(0, 0, 0),
          opacity: 0,   // 不可见但可搜/可复制
        });
        drawnCount++;
      } catch (e) { /* 罕见字形跳过 */ }
    }

    stats.push({ page: n, lines: lines.length, chars: wordsCharCount, drawn: drawnCount });
    canvas.width = canvas.height = 0;
    if (onProgress) onProgress(n - from + 1, to - from + 1);
  }

  const bytes2 = await out.save();
  bytes2.__skipped = skipped;
  return bytes2;
}

/** 校验：用 pdf.js 重新读一遍，看能提出多少文字 */

// 只识别、不写回：给「发票信息提取」这类功能用。返回每页纯文本。
export async function recognizeText(bytes, opts = {}) {
  const { langs = 'chi_sim+eng', onProgress } = opts;
  const src = await (await getPdfjs()).getDocument({ data: bytes.slice(0) }).promise;
  const total = src.numPages;
  const worker = await getWorker(langs, null);
  const texts = [];
  for (let n = 1; n <= total; n++) {
    if (typeof window !== 'undefined' && window.__ocrCancel) throw new Error('ocr-cancelled');
    const page = await src.getPage(n);
    let existing = '';
    try {
      const tc = await page.getTextContent();
      existing = tc.items.map((it) => it.str || '').join(' ').trim();
    } catch (e) {}
    if (existing.length >= 20) { texts.push(existing); if (onProgress) onProgress(n, total); continue; }
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const { data } = await worker.recognize(canvas);
    const lines = (data.lines && data.lines.length)
      ? data.lines.map((ln) => (ln.text || '').trim()).filter(Boolean)
      : (data.text || '').split(/\n+/).map((t) => t.trim()).filter(Boolean);
    texts.push(lines.join('\n'));
    if (onProgress) onProgress(n, total);
  }
  return texts;
}

export async function verifySearchable(bytes) {
  const doc = await (await getPdfjs()).getDocument({ data: bytes.slice(0) }).promise;
  let all = '';
  for (let i = 1; i <= Math.min(doc.numPages, 5); i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    all += tc.items.map((it) => it.str).join(' ') + '\n';
  }
  return all.trim();
}
