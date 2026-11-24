// 暗标体检：找「可识别投标人身份」的痕迹
// 依据：浙江/河北/内蒙/广东/山东 等地招标文件对「技术标暗标」的硬性要求
// 只做辅助检查，不替代人工复核。

export const DEFAULT_TERMS = [
  { re: /[\u4e00-\u9fa5]{2,}(有限公司|有限责任公司|股份有限公司|集团|控股|建设集团)/, level: "高", why: "公司名称" },
  { re: /\b[A-Z][A-Za-z&.\- ]{2,40}(Co\.?,?\s?Ltd|Ltd\.?|Inc\.?|LLC|Corp\.?|Corporation|Group|GmbH)\b/, level: "高", why: "公司名称（英文）" },
  { re: /(我公司|我司|我院|我厂|本单位|本公司)/, level: "中", why: "第一人称自称（部分标只允许「我方」）" },
  { re: /(CA签章|电子签章|电子印章|数字证书|U盾|CA锁)/, level: "高", why: "电子签章痕迹" },
  { re: /(地址|Address)\s*[:：]/, level: "高", why: "地址栏" },
  { re: /(电话|手机|Tel|Phone|联系方式)\s*[:：]?\s*[\d\-+() ]{7,}/, level: "高", why: "联系电话" },
  { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, level: "高", why: "邮箱" },
  { re: /(获奖|荣获|鲁班奖|詹天佑|优质工程|示范工程|荣誉证书)/, level: "中", why: "获奖情况" },
  { re: /(专利|著作权|软件著作权|ISO\s?\d{4,5}|GB\/T\s?\d+|企业标准|Q\/[A-Z]{2,})/, level: "中", why: "专利/标准/资质编号" },
  { re: /(项目经理|项目负责人|技术负责人|法定代表人)\s*[:：]\s*[\u4e00-\u9fa5]{2,4}/, level: "高", why: "人员姓名" },
  { re: /(营业执照|资质证书|安全生产许可证|开户许可证)/, level: "中", why: "证照名称" },
];

const norm = (s) => (s || "").replace(/[\s\u00a0]+/g, "");

export function buildTerms(extra) {
  const list = [...DEFAULT_TERMS];
  const words = (extra || "")
    .split(/[,，、\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  for (const w of words) {
    list.push({ re: new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), level: "高", why: "你指定的敏感词" });
  }
  return list;
}

/** 逐页提取文本 + 位置，用于找页眉页脚 */
export async function scanText(pdfjs, bytes, onProgress) {
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = tc.items.map((it) => ({
      str: it.str,
      y: it.transform[5],
      x: it.transform[4],
      h: it.height || it.transform[3] || 10,
      bottom: vp.height - it.transform[5], // 距页顶
    }));
    pages.push({ no: i, height: vp.height, items });
    if (onProgress) onProgress(i, doc.numPages);
  }
  return pages;
}

/**
 * @returns {{hits:Array, meta:Object, headerFooter:Array, stats:Object}}
 */
export function inspect(pages, terms, meta, opts = {}) {
  const pageTol = opts.pageNumberMode === "none" ? 0 : 1; // 允许页码区
  const hits = [];
  for (const p of pages) {
    for (const it of p.items) {
      const t = it.str;
      if (!t || !t.trim()) continue;
      for (const term of terms) {
        if (term.re.test(t)) {
          hits.push({ page: p.no, level: term.level, why: term.why, text: t.trim().slice(0, 60) });
          break;
        }
      }
    }
  }

  // 页眉页脚：距顶 < 6% 或距底 < 6% 有文字
  const headerFooter = [];
  for (const p of pages) {
    const top = p.height * 0.06;
    const bottom = p.height * 0.94;
    const inHeader = p.items.filter((it) => it.str.trim() && it.bottom < top);
    const inFooter = p.items.filter((it) => it.str.trim() && it.bottom > bottom);
    const isPageNum = (it) => /^[\s\-—第页共\/\d]+$/.test(it.str);
    const extraHeader = inHeader.filter((it) => !isPageNum(it));
    const extraFooter = pageTol ? inFooter.filter((it) => !isPageNum(it)) : inFooter;
    if (extraHeader.length || extraFooter.length) {
      headerFooter.push({
        page: p.no,
        where: extraHeader.length ? "页眉" : "页脚",
        text: [...extraHeader, ...extraFooter].map((i) => i.str.trim()).join(" ").slice(0, 60),
      });
    }
  }

  // 元数据
  const metaIssues = [];
  const label = { author: "作者", title: "标题", subject: "主题", keywords: "关键词", creator: "创建程序", producer: "生成工具" };
  for (const [k, name] of Object.entries(label)) {
    const v = meta[k];
    if (v && String(v).trim()) {
      const risky = /[\u4e00-\u9fa5]{2,}(公司|集团|院|厂)|Office|Word|WPS|Adobe|Chrome|PDFPocket|BidBook/i.test(v);
      if (risky) metaIssues.push({ key: name, value: String(v).slice(0, 60) });
    }
  }

  return {
    hits,
    headerFooter,
    metaIssues,
    stats: { pages: pages.length, hits: hits.length, headerFooter: headerFooter.length, meta: metaIssues.length },
  };
}
