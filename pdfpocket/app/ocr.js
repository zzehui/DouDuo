// 可搜索 PDF（双层 OCR）：渲染每页 → 识别文字 → 把隐形文字垫在原图下面
// 全部在本地跑：pdf.js 渲染、tesseract 识别、pdf-lib 写回，不走任何网络请求。
import * as pdfjs from './vendor/pdfjs/pdf.min.mjs';
import { PDFDocument, rgb } from './pdf-lib.esm.min.js';
import fontkit from './vendor/fontkit.es.min.js';

const VENDOR = new URL('./vendor/', import.meta.url).href;
pdfjs.GlobalWorkerOptions.workerSrc = VENDOR + 'pdfjs/pdf.worker.min.mjs';

const RENDER_SCALE = 2;        // ≈150dpi，够识别，内存可控
const MIN_FONT = 3.5;

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
  _worker = w;
  return w;
}

export async function terminate() {
  if (_worker) { try { await _worker.terminate(); } catch (e) {} _worker = null; }
}

/** 把 PDF 前 n 页的文字提出来，判断是不是扫描件 */
export async function detectScanned(bytes) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
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
  const src = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  const total = src.numPages;
  const from = Math.max(1, opts.from || 1);
  const to = Math.min(total, opts.to || total);

  const worker = await getWorker(langs, (m) => onLog && onLog(m));
  const fontBytes = await getFont();

  const out = await PDFDocument.load(bytes, { ignoreEncryption: true });
  PDFDocument.prototype.registerFontkit(fontkit);
  const font = await out.embedFont(fontBytes, { subset: true });

  for (let n = from; n <= to; n++) {
    const page = await src.getPage(n);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

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
      } catch (e) { /* 罕见字形跳过 */ }
    }

    canvas.width = canvas.height = 0;
    if (onProgress) onProgress(n - from + 1, to - from + 1);
  }

  return await out.save();
}

/** 校验：用 pdf.js 重新读一遍，看能提出多少文字 */
export async function verifySearchable(bytes) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  let all = '';
  for (let i = 1; i <= Math.min(doc.numPages, 5); i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    all += tc.items.map((it) => it.str).join(' ') + '\n';
  }
  return all.trim();
}
