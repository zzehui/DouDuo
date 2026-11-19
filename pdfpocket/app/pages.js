// 页面管理：缩略图、排序、删除、提取、旋转、插空白页。
// 只操作「页序模型」，导出时才真正写 PDF——所以任何一步都能反悔。
import { PDFDocument, degrees } from "./pdf-lib.esm.min.js";

// 从源 PDF 建模型：每项 { src: 页下标 } 或 { blank:true, w, h }
export async function buildModel(bytes) {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = src.getPages().map((p, i) => {
    const { width, height } = p.getSize();
    return { src: i, w: width, h: height, rot: 0 };
  });
  return { pages, W: pages[0]?.w || 595.28, H: pages[0]?.h || 841.89 };
}

export function move(model, index, delta) {
  const j = index + delta;
  if (j < 0 || j >= model.pages.length) return model;
  const [it] = model.pages.splice(index, 1);
  model.pages.splice(j, 0, it);
  return model;
}

export function removeSelected(model, picked) {
  model.pages = model.pages.filter((_, i) => !picked.has(i));
  return model;
}

export function rotateSelected(model, picked, deg = 90) {
  model.pages.forEach((p, i) => { if (picked.has(i)) p.rot = ((p.rot + deg) % 360 + 360) % 360; });
  return model;
}

export function insertBlank(model, at) {
  const ref = model.pages[Math.min(at, model.pages.length - 1)] || { w: model.W, h: model.H };
  model.pages.splice(at, 0, { blank: true, w: ref.w, h: ref.h, rot: 0 });
  return model;
}

// 导出：drop 掉删除的、按模型顺序拷贝、套上旋转
export async function exportModel(bytes, model) {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const order = model.pages.filter((p) => !p.blank);
  const copied = order.length ? await out.copyPages(src, order.map((p) => p.src)) : [];
  let k = 0;
  for (const p of model.pages) {
    if (p.blank) {
      out.addPage([p.w, p.h]);
    } else {
      const page = copied[k++];
      const base = page.getRotation().angle || 0;
      page.setRotation(degrees((base + p.rot) % 360));
      out.addPage(page);
    }
  }
  return out.save();
}

// 只导出选中的页（保持模型顺序）
export async function extractSelected(bytes, model, picked) {
  const sub = { ...model, pages: model.pages.filter((_, i) => picked.has(i)) };
  return exportModel(bytes, sub);
}

export function summary(model) {
  const blanks = model.pages.filter((p) => p.blank).length;
  return { total: model.pages.length, blanks };
}
