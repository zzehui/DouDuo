import { merge, extract, splitEvery, rotate, info, watermark } from "./core.js";
import { buildModel, move, removeSelected, rotateSelected, insertBlank, exportModel, extractSelected, summary } from "./pages.js";
import * as pdfjsLib from "./vendor/pdfjs/pdf.min.mjs";
import { recognizeText } from "./ocr.js";
import { extractInvoice, toCsv } from "./invoices.js";
pdfjsLib.GlobalWorkerOptions.workerSrc = "./vendor/pdfjs/pdf.worker.min.mjs";
import { verify, LICENSE_MAJOR } from "./license.js";

const $ = (s) => document.querySelector(s);

const DICT = {
  zh: {title:"DOUDUO PDF 口袋 · 在线版", sub:"所有处理在本机完成，文件不会离开你的电脑。", merge:"合并", split:"拆分",
        rotate:"旋转", compress:"压缩", img:"图片转 PDF", tabOcr:"识别文字", tabPage:"页面", tabInvoice:"发票", invHint:"把发票 PDF 或照片拖进来（一页一张发票），识别后把发票号码、日期、销售方、金额、税额提出来，导出成 CSV 给 Excel 用。全程本机，不上传。", invRun:"开始识别", invCsv:"导出 CSV", invEmpty:"还没有识别结果。拖入发票后点「开始识别」。", invDone:"识别完成：", invWithAmount:"张有金额", cancelled:"已取消", invCols:"文件名,页码,发票号码,开票日期,销售方,价税合计,税额", pageBtn:"导出 PDF", wmBtn:"加水印并下载", ocrBtn:"识别并下载", pgHint:"拖动缩略图改顺序；点缩略图选中，选中后可删除、提取、旋转，也能插入空白页。导出的是新文件，原文件不动。", pgUp:"上移", pgDown:"下移", pgRot:"旋转", pgDel:"删除", pgBlank:"插入空白页", pgExtract:"提取选中", pgNeedFile:"先把 PDF 拖进来，或者从最近文件里选一个", pgNeedSel:"先在缩略图上点选几页", pgBlankPage:"空白页", tagPage:"整理",
        ocrHint:"拍照、扫描、或别人发来的图片版 PDF，里面的字其实是一张张图片：选不中、搜不到、也复制不出来。识别一遍之后，页面看着完全没变，但字可以选中、搜索和复制了。", ocrWhen:"适合：扫描的合同、拍照的发票、别处下载的图片版资料。", ocrLang:"识别语言", ocrLangBoth:"中文 + 英文", ocrLangZh:"仅中文", ocrLangEn:"仅英文", ocrSpeed:"约 2–4 秒 / 页，文件不上传。", cancel:"取消", ocrNotScanned:"这份 PDF 本来就能搜索，识别完不会有变化。可以直接用其他功能。", ocrDone:"好了，现在能搜到 {n} 个字。按 Ctrl+F 试一下。", ocrSkipped:"（另有 {n} 页本来就能搜，已跳过）", tagOcr:"可搜索", drop:"把 PDF 或图片拖进来，或点这里选择",
        dropSub:"支持多选 · 不上传 · 断网也能用 · ", demo:"用样例文件试试", noFiles:"还没有文件 · 拖进来或点「选择 PDF」", again:"继续处理", dlAgain:"再下载一次", outLabel:"输出文件名", outPh:"合并.pdf", tagMerge:"合并", tagCompress:"压缩", tagExtract:"抽取", tagRotate:"旋转", tagWm:"水印", tagImg:"图片转PDF", outMore:"等{0}个", recentTitle:"最近处理", recentClear:"清空", recentEmpty:"", keysTitle:"快捷键", close:"关闭", k1:"打开文件", k2:"撤销删除/继续处理", k3:"关闭弹窗", k4:"开始处理", k5:"查看快捷键", newVersion:"有新版本，点这里刷新", again:"继续处理", dlAgain:"再下载一次", outLabel:"输出文件名", outPh:"合并.pdf", tagMerge:"合并", tagCompress:"压缩", tagExtract:"抽取", tagRotate:"旋转", tagWm:"水印", tagInvoice:"发票拼版", tagImg:"图片转PDF", outMore:"等{0}个", recentTitle:"最近处理", recentClear:"清空", recentEmpty:"", keysTitle:"快捷键", close:"关闭", k1:"打开文件", k2:"撤销删除/继续处理", k3:"关闭弹窗", k4:"开始处理", k5:"查看快捷键", meta:"{0} · {1}", newVersion:"有新版本，点这里刷新", run:"开始处理",
        tipA:"全部功能免费 · ", tipB:"不限文件数与页数", langLabel:"界面语言", working:"处理中…", tabWm:"水印", wmHint:"给 PDF 叠一层斜向文字水印，可当草稿/内部资料标记。文字可选中、可搜索。", splitEvery:"每 N 页切一份", splitRange:"只取这些页", rotAll:"整份", rotRange:"只转这几页", deg90:"顺时针 90°", deg270:"顺时针 270°", lvLight:"轻（2200px）", lvNormal:"标准（1600px）", lvStrong:"强（1100px）", themeToDark:"切到深色", themeToLight:"切到浅色",
        merged:"合并并下载", splitBtn:"拆分并下载", rotBtn:"旋转并下载", compBtn:"压缩并下载", imgBtn:"转成 PDF",
        added:"已加入样例.pdf（3 页）", fail:"处理失败：", noImg:"先加几张图片", demoFail:"样例加载失败：",
        splitOne:"份，在线版只下载第一份；批量导出请用扩展版", badRange:"页码写错了", unit:" 个文件 · ",
        mergeHint:"按列表顺序合并；可拖拽行调整顺序，也可用 ↑↓",
        padEven:"双面打印：奇数页补空白页", unifySize:"统一成 A4 尺寸",
        removedOne:"已移除 {0}", undo:"撤销", undone:"已撤销",
        pagesUnit:"页", unitFiles:"个文件", unitPages:"页", unitImages:"张图", unitParts:"份", up:"上移", down:"下移", invBtn:"拼版并下载", splitHint:"每 N 页切一份，或只取指定页（1-3,5）", imgHint:"每张图一页 A4，等比缩放居中，最多 5 张", compHint:"重压缩内嵌图片，文字与矢量保持清晰",
        pwaHint:"装到桌面，下次点图标直接打开", pwaInstall:"安装到桌面", pwaDone:"已安装，桌面见", folder:"合并整个文件夹…", folderPick:"选一个文件夹，把里面所有 PDF 按文件名顺序合成一个", folderNone:"这个文件夹里没有 PDF", demoName:"样例.pdf", folderDone:"已加入 {0} 个 PDF", folderNoSupport:"这个浏览器不支持选文件夹，请用「选择 PDF」多选", pwaManual:"没有安装入口？用地址栏右侧的安装图标",
        wmLabel:"加水印", wmPh:"内部资料", wmDefault:"内部资料", close:"关闭", licExpired:"这个码已过期",},
  en: {title:"DOUDUO PDF Pocket · Web", sub:"Everything runs on your machine. Your files never leave your computer.", merge:"Merge",
        split:"Split", rotate:"Rotate", compress:"Compress", img:"Images to PDF", tabOcr:"Recognize text", tabPage:"Pages", tabInvoice:"Invoices", invHint:"Drop invoice PDFs or photos (one invoice per page). It pulls out invoice number, date, seller, total and tax, then exports CSV for Excel. Everything stays on your machine.", invRun:"Recognize", invCsv:"Export CSV", invEmpty:"No results yet. Drop invoices and hit Recognize.", invDone:"Done:", invWithAmount:"with an amount", cancelled:"Cancelled", invCols:"File,Page,Invoice no.,Date,Seller,Total,Tax", pageBtn:"Export PDF", wmBtn:"Watermark & download", ocrBtn:"Recognize & download", pgHint:"Drag thumbnails to reorder; click to select, then delete, extract, rotate or insert a blank page. The export is a new file; your original is untouched.", pgUp:"Move up", pgDown:"Move down", pgRot:"Rotate", pgDel:"Delete", pgBlank:"Insert blank", pgExtract:"Extract selected", pgNeedFile:"Drop a PDF first, or pick one from Recent", pgNeedSel:"Click a few thumbnails first", pgBlankPage:"Blank", tagPage:"pages", ocrHint:"In a scanned or photographed PDF the words are just pictures: you cannot select, search or copy them. After recognition the page looks exactly the same, but the words become selectable and searchable.", ocrWhen:"Good for: scanned contracts, photographed invoices, image-only PDFs from elsewhere.", ocrLang:"Language", ocrLangBoth:"Chinese + English", ocrLangZh:"Chinese only", ocrLangEn:"English only", ocrSpeed:"About 2–4 s per page. Your file is never uploaded.", cancel:"Cancel", ocrNotScanned:"This PDF is already searchable — recognition will not change it.", ocrDone:"Done. {n} characters are searchable now — try Ctrl+F.", ocrSkipped:" ({n} pages were already searchable)", tagOcr:"searchable", drop:"Drop PDFs or images here, or click to choose",
        dropSub:"Multiple files · no upload · works offline · ", demo:"try a sample file", noFiles:"No files yet — drop files or click Choose PDFs", again:"Process more", dlAgain:"Download again", outLabel:"Output file name", outPh:"merged.pdf", tagMerge:"merged", tagCompress:"compressed", tagExtract:"extracted", tagRotate:"rotated", tagWm:"watermarked", tagImg:"images", outMore:"+{0}", recentTitle:"Recent", recentClear:"Clear", keysTitle:"Keyboard shortcuts", close:"Close", k1:"Open files", k2:"Undo delete / keep processing", k3:"Close dialog", k4:"Run", k5:"Show shortcuts", newVersion:"Update ready — refresh", again:"Process more", dlAgain:"Download again", outLabel:"Output file name", outPh:"merged.pdf", tagMerge:"merged", tagCompress:"compressed", tagExtract:"extracted", tagRotate:"rotated", tagWm:"watermarked", tagImg:"images", outMore:"+{0}", recentTitle:"Recent", recentClear:"Clear", keysTitle:"Keyboard shortcuts", close:"Close", k1:"Open files", k2:"Undo delete / keep processing", k3:"Close dialog", k4:"Run", k5:"Show shortcuts", meta:"{0} · {1}", newVersion:"Update ready — refresh", run:"Run",
        tipA:"Split, rotate and watermark, all free · ", tipB:"activate from the button above", langLabel:"Interface language", working:"Working…", splitEvery:"Every N pages", splitRange:"Only these pages", rotAll:"All pages", rotRange:"Only these pages", deg90:"90° clockwise", deg270:"270° clockwise", lvLight:"Light (2200px)", lvNormal:"Standard (1600px)", lvStrong:"Strong (1100px)", tabWm:"Watermark", wmHint:"Stamps a diagonal text watermark on every page — for drafts or internal notes. The text stays selectable and searchable.", themeToDark:"Switch to dark", themeToLight:"Switch to light",
        merged:"Merge & download", splitBtn:"Split & download", rotBtn:"Rotate & download", compBtn:"Compress & download", imgBtn:"Convert to PDF",
        added:"sample.pdf added (3 pages)", fail:"Failed: ", noImg:"add some images first", demoFail:"Sample failed: ",
        splitOne:" parts — web version downloads the first only; batch export is in the extension", badRange:"bad page range", unit:" files · ",
        mergeHint:"Merge in list order — drag a row, or use ↑↓",
        padEven:"Double-sided: pad odd files with a blank page", unifySize:"Normalise every page to A4",
        removedOne:"Removed {0}", undo:"Undo", undone:"Undone",
        pagesUnit:"pages", unitFiles:" files", unitPages:" pages", unitImages:" images", unitParts:" parts", up:"Move up", down:"Move down", invBtn:"Build sheet & download", splitHint:"Split every N pages, or take specific pages (1-3,5)", imgHint:"One A4 page per image, scaled to fit. Max 5 images.", compHint:"Re-compresses embedded images; text and vectors stay crisp.",
        pwaHint:"Install to desktop — open it next time without typing a URL", pwaInstall:"Install to desktop", pwaDone:"Installed — check your desktop", folder:"Merge a whole folder…", folderPick:"Pick a folder; every PDF in it is merged in name order", folderNone:"No PDFs in that folder", demoName:"sample.pdf", folderDone:"Added {0} PDFs", folderNoSupport:"This browser can't pick a folder — use Choose PDFs", pwaManual:"No install prompt — use the install icon in the address bar",
        wmLabel:"Add watermark", wmPh:"CONFIDENTIAL", wmDefault:"CONFIDENTIAL", activate:"Activate", close:"Close", licExpired:"That key has expired",}
};
let LANG = (() => {
  try { const saved = localStorage.getItem("lang"); if (saved === "zh" || saved === "en") return saved; } catch (e) {}
  return (navigator.language || "zh").toLowerCase().startsWith("zh") ? "zh" : "en";
})();
const T = (k, a) => { const s = DICT[LANG][k] != null ? DICT[LANG][k] : (DICT.zh[k] || k); return a ? s.replace(/\{(\d+)\}/g, (m, i) => (a[+i] != null ? a[+i] : m)) : s; };
function applyLang() {
  document.documentElement.lang = LANG === "zh" ? "zh-CN" : "en";
  document.title = T("title");
  document.querySelectorAll("[data-t]").forEach((el) => {
    const text = T(el.dataset.t);
    const badge = el.querySelector(".prodot");
    if (badge) {
      const node = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
      if (node) node.nodeValue = text; else el.insertBefore(document.createTextNode(text), el.firstChild);
    } else {
      el.textContent = text;
    }
  });
  document.querySelectorAll("[data-t-ph]").forEach((el) => { el.placeholder = T(el.dataset.tPh); });
  document.querySelectorAll("[data-t-aria]").forEach((el) => { el.setAttribute("aria-label", T(el.dataset.tAria)); });
  document.querySelectorAll("[data-t-title]").forEach((el) => { el.title = T(el.dataset.tTitle); });
  document.querySelectorAll("#langSeg button").forEach((b) => b.classList.toggle("on", b.dataset.lang === LANG));
}

document.querySelectorAll("#langSeg button").forEach((b) => {
  b.addEventListener("click", () => {
    LANG = b.dataset.lang;
    try { localStorage.setItem("lang", LANG); } catch (e) {}
    applyLang(); paint();
  });
});

/* ---------- 最近处理（IndexedDB，只存本机） ---------- */
const RECENT_MAX = 5, RECENT_BYTES = 8 * 1024 * 1024;
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("pp-recent", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files", { keyPath: "id" });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function recentAll() {
  try {
    const db = await idb();
    return await new Promise((res) => {
      const out = [];
      const cur = db.transaction("files", "readonly").objectStore("files").openCursor();
      cur.onsuccess = (e) => { const c = e.target.result; if (c) { out.push(c.value); c.continue(); } else res(out.sort((a, b) => b.ts - a.ts)); };
      cur.onerror = () => res([]);
    });
  } catch (e) { return []; }
}
async function recentPut(rec) {
  try {
    const db = await idb();
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(rec);
    await new Promise((r) => { tx.oncomplete = r; tx.onerror = r; });
    const all = await recentAll();
    const drop = all.slice(RECENT_MAX);
    if (drop.length) {
      const tx2 = db.transaction("files", "readwrite");
      drop.forEach((d) => tx2.objectStore("files").delete(d.id));
      await new Promise((r) => { tx2.oncomplete = r; tx2.onerror = r; });
    }
  } catch (e) {}
}
async function renderRecent() {
  const box = document.querySelector("#recent"), list = document.querySelector("#recentList");
  if (!box || !list) return;
  const all = (await recentAll()).filter((r) => r.bytes);
  box.hidden = all.length === 0;
  list.innerHTML = all.map((r) => `<button class="ritem" data-recent="${r.id}"><span>${r.name}</span><em style="color:var(--dim);font-style:normal">${human(r.bytes.length)}</em></button>`).join("");
  list.querySelectorAll("[data-recent]").forEach((b) => {
    b.onclick = async () => {
      const rec = all.find((x) => x.id === b.dataset.recent);
      if (rec) await add([new File([rec.bytes], rec.name, { type: rec.type || "application/pdf" })]);
    };
  });
}
document.querySelector("#recentClear")?.addEventListener("click", async () => {
  try { const db = await idb(); const tx = db.transaction("files", "readwrite"); tx.objectStore("files").clear(); await new Promise((r) => { tx.oncomplete = r; }); } catch (e) {}
  renderRecent();
});

/* ---------- 快捷键 ---------- */
function toggleKeys(force) {
  const el = document.querySelector("#keys"); if (!el) return;
  el.hidden = force === undefined ? !el.hidden : !force;
}
document.querySelector("#keysClose")?.addEventListener("click", () => toggleKeys(false));
function buildKeys() {
  const ul = document.querySelector("#keysList"); if (!ul) return;
  const rows = [["Ctrl / ⌘ + O", T("k1")], ["Ctrl / ⌘ + Z", T("k2")], ["Esc", T("k3")], ["Enter", T("k4")], ["?", T("k5")]];
  ul.innerHTML = rows.map(([k, d]) => `<li><kbd>${k}</kbd>${d}</li>`).join("");
}
document.addEventListener("keydown", (e) => {
  if (e.key === "?" && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); toggleKeys(); }
});

const state = {
  outTouched: false, mode: "merge", files: [], plan: "free", email: "", major: 0 };

/* 主题切换 */
function paintThemeBtn() {
  const t = document.documentElement.getAttribute("data-theme");
  const b = document.querySelector("#themeBtn");
  if (b) { b.textContent = t === "light" ? "☀" : "☾"; b.title = t === "light" ? T("themeToDark") : T("themeToLight"); }
}
document.querySelector("#themeBtn").addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme");
  window.__applyTheme(cur === "light" ? "dark" : "light");
  paintThemeBtn();
});
document.addEventListener("themechange", paintThemeBtn);
paintThemeBtn();

const GATED = []; // 全部功能免费
function applyPlan() {
  document.querySelectorAll(".tab .prodot").forEach((b) => { b.hidden = true; });
  const pro = true; // 全部免费
  document.querySelectorAll(".tab").forEach((t2) => {
    const gated = GATED.includes(t2.dataset.mode);
    const badge = t2.querySelector(".prodot");
    if (badge) badge.hidden = pro || !gated;
    t2.classList.toggle("gated", gated && !pro);
    t2.hidden = false;
  });
  const wmc = document.querySelector("#wmOn");
  if (wmc) { wmc.checked = pro && wmc.checked; }
  const wmt = document.querySelector("#wmText"); if (wmt) wmt.readOnly = !pro;
  const wmb = document.querySelector("#wmProBadge"); if (wmb) wmb.hidden = pro;
  if (!pro && GATED.includes(state.mode)) state.mode = "merge";
  const tip = document.querySelector("footer.tip"); if (tip) tip.hidden = false;
  document.querySelectorAll("[data-t-ph]").forEach((el) => { el.placeholder = T(el.dataset.tPh); });
}

async function bootLicense() {
  try {
    const key = localStorage.getItem("pp_license");
    if (!key) return;
    const v = await verify(key);
    if (v.ok && v.major >= LICENSE_MAJOR) { state.plan = "pro"; state.email = v.email; state.major = v.major; applyPlan(); }
  } catch { /* 校验失败就保持免费版 */ }
}



const drop = $("#drop"), input = $("#fileInput");
drop.addEventListener("click", () => input.click());
input.addEventListener("change", (e) => { add([...e.target.files]); input.value = ""; });
["dragenter","dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave","drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => add([...e.dataTransfer.files]));


$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest(".tab"); if (!b) return;
  state.mode = b.dataset.mode;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t === b));
  document.querySelectorAll(".opt").forEach((o) => o.classList.toggle("on", o.id === "opt-" + state.mode));
paint();
  if (state.mode === "page") renderPages();
  if (state.mode === "invoice") renderInvTable();
});

// 演示文件：只注册一次
$("#demoLink").addEventListener("click", async (e) => {
  e.preventDefault(); e.stopPropagation();
  try {
    const r = await fetch("./demo.pdf");
    const buf = new Uint8Array(await r.arrayBuffer());
    const meta = await info(buf);
    state.files.push({ name: T("demoName"), size: buf.length, pages: meta.pages, buf });
    paint(); toast(T("added"));
  } catch (err) { toast(T("demoFail") + (err.message || err)); }
});

async function add(list) {
  const imgs = list.filter((f) => /^image\/(jpeg|png)$/i.test(f.type) || /\.(jpe?g|png)$/i.test(f.name));
  if (imgs.length) {
    for (const f of imgs) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      state.files.push({ name: f.name, size: f.size, pages: 1, buf: bytes, kind: "image", type: f.type });
    }
    if (state.mode !== "img") { state.mode = "img"; document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("on", t.dataset.mode==="img")); document.querySelectorAll(".opt").forEach(o=>o.classList.toggle("on", o.id==="opt-img")); }
  }
  for (const f of list.filter((f) => /\.pdf$/i.test(f.name))) {
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      const meta = await info(buf);
      state.files.push({ name: f.name, size: f.size, pages: meta.pages, buf });
    } catch (err) { toast("读不了这个文件：" + (err.message || err)); }
  }
  for (const f of state.files.slice(-list.length)) {
    if (f.buf && f.buf.byteLength <= RECENT_BYTES) {
      await recentPut({ id: `${f.name}-${f.size}`, name: f.name, size: f.size, pages: f.pages, type: f.type || "application/pdf", ts: Date.now(), bytes: f.buf });
    }
  }
  await renderRecent();
paint();
}

function human(b) { return b > 1048576 ? (b/1048576).toFixed(1)+" MB" : b > 1024 ? Math.round(b/1024)+" KB" : b+" B"; }

let lastRemoved = null;

function paint() {
  const rows = state.files.map((f, i) => `
    <div class="file">
      <span>${i + 1}</span>
      <span class="n">${f.name}</span>
      <span class="meta">${f.pages} ${T("pagesUnit")} · ${human(f.size)}</span>
      <span class="updown">
        <button data-up="${i}" title="${T("up")}" ${i === 0 ? "disabled" : ""}>↑</button>
        <button data-down="${i}" title="${T("down")}" ${i === state.files.length - 1 ? "disabled" : ""}>↓</button>
      </span>
      <button class="btn ghost rowdel" data-x="${i}">×</button>
    </div>`).join("");
  $("#files").innerHTML = rows;
  document.querySelectorAll("[data-x]").forEach((b) => { b.onclick = () => {
    const i = +b.dataset.x;
    const [removed] = state.files.splice(i, 1);
    lastRemoved = { file: removed, index: i };
    paint();
    toastAction(T("removedOne", [removed.name]), T("undo"), () => { state.files.splice(i, 0, removed); paint(); });
  }; });
  document.querySelectorAll("[data-up]").forEach((b) => { b.onclick = () => {
    const i = +b.dataset.up; if (i > 0) { [state.files[i - 1], state.files[i]] = [state.files[i], state.files[i - 1]]; paint(); } }; });
  document.querySelectorAll("[data-down]").forEach((b) => { b.onclick = () => {
    const i = +b.dataset.down; if (i < state.files.length - 1) { [state.files[i + 1], state.files[i]] = [state.files[i], state.files[i + 1]]; paint(); } }; });

  // 拖拽排序（桌面）+ 长按拖动（手机靠 ↑↓）
  let dragFrom = -1;
  document.querySelectorAll("#files .file").forEach((row, i) => {
    row.draggable = true;
    row.addEventListener("dragstart", (e) => { dragFrom = i; row.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
    row.addEventListener("dragend", () => { row.classList.remove("dragging"); document.querySelectorAll("#files .file").forEach((r) => r.classList.remove("over")); });
    row.addEventListener("dragover", (e) => { e.preventDefault(); row.classList.add("over"); });
    row.addEventListener("dragleave", () => row.classList.remove("over"));
    row.addEventListener("drop", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (dragFrom < 0 || dragFrom === i) return;
      const [m] = state.files.splice(dragFrom, 1);
      state.files.splice(i, 0, m);
      dragFrom = -1; paint();
    });
  });

  const pages = state.files.reduce((a, f) => a + f.pages, 0);
  const size = state.files.reduce((a, f) => a + f.size, 0);
  $("#summary").textContent = state.files.length
    ? (LANG === "zh"
        ? `${state.files.length} 个文件 · ${pages} 页 · ${human(size)}`
        : `${state.files.length} file${state.files.length > 1 ? "s" : ""} · ${pages} page${pages > 1 ? "s" : ""} · ${human(size)}`)
    : T("noFiles");
  ensureOutName();
  $("#runBtn").disabled = !state.files.length;
  $("#runBtn").textContent = { merge: T("merged"), split: T("splitBtn"), rotate: T("rotBtn"), compress: T("compBtn"), img: T("imgBtn"), wm: T("wmBtn"), ocr: T("ocrBtn"), page: T("pageBtn"), invoice: T("invRun") }[state.mode] || T("merged");
}

let DL = { bytes: null, name: "" };
function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  showResult(bytes, name);
}
function stem(n) { return (n || "").replace(/\.[^.]+$/, "") || (LANG === "zh" ? "输出" : "output"); }
function autoOutName(tag) {
  const f = state.files[0];
  if (!f) return "";
  const n = state.files.length;
  const more = n > 1 ? (LANG === "zh" ? `等${n}个` : `+${n - 1}`) : "";
  return `${stem(f.name)}${more}-${tag}.pdf`;
}
function ensureOutName() {
  const el = document.querySelector("#outName");
  if (!el || state.outTouched) return;
  el.value = autoOutName(T("tagMerge"));
}
function showResult(bytes, name) {
  DL.bytes = bytes; DL.name = name;
  const el = document.querySelector("#result");
  if (!el) return;
  document.querySelector("#rName").textContent = name;
  document.querySelector("#rMeta").textContent =
    (LANG === "zh" ? "已下载 · " : "Downloaded · ") + human(bytes.byteLength);
  el.hidden = false;
}
document.addEventListener("click", (e) => {
  const t2 = e.target.closest("button[id]");
  if (!t2) return;
  if (t2.id === "rDl" && DL.bytes) download(DL.bytes, DL.name);
  if (t2.id === "rAgain") {
    state.files = []; paint();
    document.querySelector("#result").hidden = true;
    document.querySelector("#fileInput").click();
  }
});

// Ctrl/Cmd+O 打开文件；Esc 关弹窗（已有）
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
    e.preventDefault(); document.querySelector("#fileInput").click();
  }
});

let tt;
function progStart(label) {
  const el = document.querySelector("#prog");
  if (!el) return;
  document.querySelector("#progLabel").textContent = label || T("working");
  document.querySelector("#progCount").textContent = "";
  document.querySelector("#progFill").style.width = "0%";
  el.hidden = false;
}
function progSet(done, total, unit) {
  const el = document.querySelector("#progFill"); if (!el) return;
  const pct = total ? Math.round((done / total) * 100) : 0;
  el.style.width = pct + "%";
  document.querySelector("#progCount").textContent = total ? `${pct}% · ${done}/${total}${unit || ""}` : "";
}
function totalMB() {
  var b = state.files.reduce(function (a, f) { return a + f.buf.byteLength; }, 0);
  return b / 1048576;
}
function progEnd() { const el = document.querySelector("#prog"); if (el) el.hidden = true; }

function toast(msg) {
  const el = $("#toast"); el.textContent = msg; el.hidden = false;
  clearTimeout(tt); tt = setTimeout(() => el.hidden = true, 4200);
}

// 带一个动作按钮的提示（用于「已删除 · 撤销」）
function toastAction(msg, actionLabel, onAction) {
  const el = $("#toast");
  el.textContent = "";
  const span = document.createElement("span"); span.textContent = msg;
  const btn = document.createElement("button");
  btn.className = "btn ghost"; btn.textContent = actionLabel;
  btn.style.cssText = "margin-left:12px;padding:4px 10px;font-size:13px";
  btn.onclick = () => { el.hidden = true; clearTimeout(tt); onAction(); };
  el.append(span, btn); el.hidden = false;
  clearTimeout(tt); tt = setTimeout(() => (el.hidden = true), 8000);
}

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && lastRemoved) {
    e.preventDefault();
    state.files.splice(lastRemoved.index, 0, lastRemoved.file);
    lastRemoved = null; paint(); toast(T("undone"));
  }
  if (e.key === "Escape") document.querySelectorAll(".modal").forEach((m) => (m.hidden = true));
});


// ---------------- 页面管理 ----------------
let PG = null;          // { src, model }
let PGsel = new Set();  // 选中的页下标

async function renderPages() {
  const grid = $("#pgGrid"), infoEl = $("#pgInfo");
  if (!state.files.length) {
    grid.innerHTML = `<div class="hint" style="padding:18px">${T("pgNeedFile")}</div>`;
    infoEl.textContent = "";
    return;
  }
  const f = state.files[0];
  if (!PG || PG.src !== f.buf) {
    PG = { src: f.buf, model: await buildModel(f.buf) };
    PGsel = new Set();
  }
  if (!PG.pdf) PG.pdf = await pdfjsLib.getDocument({ data: f.buf.slice(0) }).promise;
  grid.innerHTML = "";
  for (let i = 0; i < PG.model.pages.length; i++) {
    const it = PG.model.pages[i];
    const card = document.createElement("div");
    card.className = "pcard" + (PGsel.has(i) ? " sel" : "");
    card.draggable = true;
    card.dataset.i = String(i);
    if (it.blank) {
      const d = document.createElement("div");
      d.className = "pthumb blank";
      d.textContent = T("pgBlankPage");
      card.appendChild(d);
    } else {
      const page = await PG.pdf.getPage(it.src + 1);
      const vp = page.getViewport({ scale: 0.2 });
      const c = document.createElement("canvas");
      c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      card.appendChild(c);
    }
    const n = document.createElement("div");
    n.className = "pnum";
    n.textContent = String(i + 1) + (it.rot ? ` · ${it.rot}°` : "");
    card.appendChild(n);
    card.onclick = () => {
      if (PGsel.has(i)) PGsel.delete(i); else PGsel.add(i);
      card.classList.toggle("sel");
      paintPgInfo();
    };
    card.ondragstart = (e) => { e.dataTransfer.setData("text/plain", String(i)); };
    grid.appendChild(card);
  }
  grid.ondragover = (e) => e.preventDefault();
  grid.ondrop = (e) => {
    e.preventDefault();
    const from = parseInt(e.dataTransfer.getData("text/plain"), 10);
    const target = e.target.closest(".pcard");
    const to = target ? parseInt(target.dataset.i, 10) : PG.model.pages.length - 1;
    if (isNaN(from) || isNaN(to) || from === to) return;
    const [item] = PG.model.pages.splice(from, 1);
    PG.model.pages.splice(to, 0, item);
    PGsel.clear();
    renderPages();
  };
  paintPgInfo();
}

function paintPgInfo() {
  if (!PG) return;
  const s2 = summary(PG.model);
  const el = $("#pgInfo");
  if (el) el.textContent = `${s2.total} 页` + (s2.blanks ? ` · 含 ${s2.blanks} 张空白页` : "") + (PGsel.size ? ` · 已选 ${PGsel.size}` : "");
}

function pgGuard() {
  if (!PG || !PG.model.pages.length) { toast(T("pgNeedFile")); return false; }
  if (!PGsel.size) { toast(T("pgNeedSel")); return false; }
  return true;
}

$("#pgRot").onclick = () => { if (!pgGuard()) return; rotateSelected(PG.model, PGsel, 90); renderPages(); };
$("#pgDel").onclick = () => { if (!pgGuard()) return; removeSelected(PG.model, PGsel); PGsel.clear(); renderPages(); };
$("#pgBlank").onclick = () => {
  if (!PG) { toast(T("pgNeedFile")); return; }
  const at = PGsel.size ? Math.max(...PGsel) + 1 : PG.model.pages.length;
  insertBlank(PG.model, at); PGsel.clear(); renderPages();
};
$("#pgUp").onclick = () => { if (!pgGuard()) return; const i = Math.min(...PGsel); move(PG.model, i, -1); PGsel = new Set([Math.max(0, i - 1)]); renderPages(); };
$("#pgDown").onclick = () => { if (!pgGuard()) return; const i = Math.max(...PGsel); move(PG.model, i, 1); PGsel = new Set([Math.min(PG.model.pages.length - 1, i + 1)]); renderPages(); };
$("#pgExtract").onclick = async () => {
  if (!pgGuard()) return;
  const f = state.files[0];
  try {
    const bytes = await extractSelected(f.buf, PG.model, PGsel);
    download(bytes, autoOutName(T("tagPage")));
    doneToast(autoOutName(T("tagPage")), bytes.byteLength, performance.now());
  } catch (e) { toast(T("fail") + (e.message || e)); }
};


// ---------------- 发票识别 ----------------
let INV_ROWS = [];

function renderInvTable() {
  const wrap = $("#invTableWrap");
  $("#invCsv").disabled = !INV_ROWS.length;
  if (!INV_ROWS.length) {
    wrap.innerHTML = `<div class="hint" style="padding:16px">${T("invEmpty")}</div>`;
    return;
  }
  const cell = (v, cls) => `<td class="${cls || ""}">${String(v == null ? "" : v).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</td>`;
  const head = T("invCols").split(",").map((h) => `<th>${h}</th>`).join("");
  const body = INV_ROWS.map((r) => "<tr>"
    + cell(r.file) + cell(r.page, "num") + cell(r.no) + cell(r.code) + cell(r.date)
    + cell(r.seller) + cell(r.total, "num") + cell(r.tax, "num") + "</tr>").join("");
  wrap.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

$("#invRun").onclick = async () => {
  if (!state.files.length) { toast(T("pgNeedFile")); return; }
  const btn = $("#invRun");
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = T("working");
  INV_ROWS = [];
  renderInvTable();
  try {
    let done = 0;
    const totalPages = state.files.reduce((k, f) => k + (f.pages || 1), 0);
    for (const f of state.files) {
      const texts = await recognizeText(f.buf, {
        langs: $("#invLang").value,
        onProgress: (n, p) => { progSet(done + n, totalPages, T("unitPages") || "页"); },
      });
      texts.forEach((tx, i) => {
        const r = extractInvoice(tx);
        INV_ROWS.push({ file: f.name, page: i + 1, ...r });
      });
      done += texts.length;
    }
    renderInvTable();
    const hit = INV_ROWS.filter((r) => r.total).length;
    toast(`${T("invDone")} ${INV_ROWS.length} ${T("pgPagesWord") || "页"} · ${hit} ${T("invWithAmount") || "张有金额"}`);
  } catch (e) {
    toast(e && String(e.message) === "ocr-cancelled" ? T("cancelled") : T("fail") + (e.message || e));
  } finally {
    btn.disabled = false;
    btn.textContent = old;
    progEnd();
  }
};

$("#invCsv").onclick = () => {
  if (!INV_ROWS.length) return;
  const csv = toCsv(INV_ROWS);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "发票清单-" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

$("#runBtn").addEventListener("click", async () => {
  const btn = $("#runBtn"); btn.disabled = true; const old = btn.textContent; btn.textContent = T("working");
  progStart(T("working"));
  try {
    if (state.mode === "merge") {
      let buffers = state.files.map((f) => f.buf);
      const wmOn = document.querySelector("#wmOn");
      if (wmOn && wmOn.checked) {
        const txt = (document.querySelector("#wmText").value || "").trim() || T("wmDefault");
        buffers = await Promise.all(buffers.map((b) => watermark(b, txt)));
      }
      const opts = {
        padEven: document.querySelector("#padEven").checked,
        uniform: document.querySelector("#unify").checked,
      };
      const outM = (document.querySelector("#outName").value || "").trim() || autoOutName(T("tagMerge"));
      download(await merge(buffers, opts, (d, t2) => progSet(d, t2, T("unitFiles"))), outM.endsWith(".pdf") ? outM : outM + ".pdf");
    } else if (state.mode === "page") {
      if (!PG || !PG.model.pages.length) { toast(T("pgNeedFile")); return; }
      const t0 = performance.now();
      const bytes = await exportModel(state.files[0].buf, PG.model);
      const nm = autoOutName(T("tagPage"));
      download(bytes, nm);
      doneToast(nm, bytes.byteLength, t0);
    } else if (state.mode === "split") {
      const mode = document.querySelector('input[name="sm"]:checked').value;
      if (mode === "range") download(await extract(state.files[0].buf, $("#splitRange").value.trim()), autoOutName(T("tagExtract")));
      else {
        const parts = await splitEvery(state.files[0].buf, Math.max(1, +$("#splitN").value || 1));
        const n = parts.length;
        for (let k = 0; k < n; k++) {
          const bn = stem(state.files[0].name);
          download(parts[k].bytes, `${bn}-${LANG === "zh" ? "第" + (k + 1) + "份" : "part" + String(k + 1).padStart(2, "0")}.pdf`);
          progSet(k + 1, parts.length, T("unitParts"));
          if (k < n - 1) await new Promise((r) => setTimeout(r, 260));
        }
        
      }
    } else if (state.mode === "wm") {
      const txt = (($("#wmOnlyText").value || "").trim()) || T("wmDefault");
      const bytes = await watermark(state.files[0].buf, txt);
      const nm = autoOutName(T("tagWm"));
      const t0 = performance.now();
      download(bytes, nm); DL = { bytes, name: nm };
      doneToast(nm, bytes.byteLength, t0);
    } else if (state.mode === "rotate") {
      const scope = document.querySelector('input[name="rm"]:checked').value;
      download(await rotate(state.files[0].buf, scope === "range" ? $("#rotateRange").value.trim() : "", +$("#rotateDeg").value), autoOutName(T("tagRotate")));
    } else if (state.mode === "ocr") {
      const { detectScanned, makeSearchable, verifySearchable } = await import("./ocr.js");
      const det = await detectScanned(state.files[0].buf);
      if (!det.scanned) toast(T("ocrNotScanned"));
      const cancelBtn = document.querySelector("#ocrCancel");
      window.__ocrCancel = false;
      cancelBtn.hidden = false;
      cancelBtn.onclick = () => { window.__ocrCancel = true; };
      let bytes;
      try {
        bytes = await makeSearchable(state.files[0].buf, {
          langs: document.querySelector("#ocrLang").value,
          onProgress: (i, n) => progSet(i, n, T("unitPages")),
        });
      } finally { cancelBtn.hidden = true; }
      const nm = autoOutName(T("tagOcr"));
      download(bytes, nm); DL = { bytes, name: nm };
      showResult(bytes, nm);
      const txt = await verifySearchable(bytes);
      const nChar = txt.replace(/\s+/g, "").length;
      const extra = (bytes.__skipped ? T("ocrSkipped").replace("{n}", String(bytes.__skipped)) : "");
      toast(T("ocrDone").replace("{n}", String(nChar)) + extra);
    } else if (state.mode === "img") {
      const { imagesToPdf } = await import("./core.js");
      const items = state.files.filter((f) => f.kind === "image").map((f) => ({ bytes: f.buf, type: f.type, name: f.name }));
      if (!items.length) throw new Error(T("noImg"));
      download(await imagesToPdf(items), autoOutName(T("tagImg")));
    } else {
      const { compress } = await import("./compress.js");
      const before = state.files[0].buf.byteLength;
      const bytes = await compress(state.files[0].buf, $("#level").value, (d, t2) => progSet(d, t2, T("unitImages")));
      const outC = autoOutName(T("tagCompress"));
      download(bytes, outC);
      toast(`${human(before)} → ${human(bytes.length)}`);
    }
    if (window.ddTrack) window.ddTrack(state.mode, true, { files: state.files.length, mb: Math.round(totalMB()) });
  } catch (e) {
    if (window.ddTrack) window.ddTrack(state.mode, false, { files: state.files.length });
    toast(T("fail") + (e.message === "empty-range" ? T("badRange") : e.message || e));
  } finally { progEnd(); btn.disabled = !state.files.length; btn.textContent = old; paint(); }
});


applyLang();
buildKeys();

(function () {
  var t = document.querySelector("#statToggle");
  if (!t) return;
  var off = false; try { off = localStorage.getItem("dd_notrack") === "1"; } catch (e) {}
  function paint() { t.textContent = off ? "统计：关" : "统计：开"; }
  paint();
  t.addEventListener("click", function () {
    off = !off;
    try { localStorage.setItem("dd_notrack", off ? "1" : "0"); } catch (e) {}
    paint();
  });
})();
renderRecent();
paint();
bootLicense();
applyPlan();

// ---------- 合并整个文件夹（Chromium 的 File System Access API） ----------
const folderBtn = $("#folderBtn");
const canFolder = typeof window.showDirectoryPicker === "function";
if (!canFolder && folderBtn) { folderBtn.disabled = true; folderBtn.title = T("folderNoSupport"); }
if (folderBtn && canFolder) folderBtn.addEventListener("click", async () => {
  try {
    const dir = await window.showDirectoryPicker({ mode: "read" });
    const picked = [];
    for await (const [, handle] of dir.entries()) {
      if (handle.kind !== "file" || !/\.pdf$/i.test(handle.name)) continue;
      picked.push(await handle.getFile());
    }
    if (!picked.length) { toast(T("folderNone")); return; }
    picked.sort((a, b) => a.name.localeCompare(b.name, "zh"));
    await add(picked);
    toast(T("folderDone", [String(picked.length)]));
  } catch (err) {
    if (err && err.name === "AbortError") return;
    toast((err && err.message) || String(err));
  }
});

// ---------- 安装到桌面（PWA） ----------
const pwaBar = $("#pwaBar"), installBtn = $("#installBtn");
let installEvent = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); installEvent = e;
  if (pwaBar) pwaBar.hidden = false;
});
if (installBtn) installBtn.addEventListener("click", async () => {
  if (!installEvent) { toast(T("pwaManual")); return; }
  installEvent.prompt();
  const { outcome } = await installEvent.userChoice;
  installEvent = null;
  if (pwaBar) pwaBar.hidden = true;
  if (outcome === "accepted") toast(T("pwaDone"));
});
window.addEventListener("appinstalled", () => { if (pwaBar) pwaBar.hidden = true; toast(T("pwaDone")); });

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then((reg) => {
      reg.update();
      const offer = (w) => {
        if (!w) return;
        const el = document.querySelector("#toast");
        if (!el) return;
        el.textContent = T("newVersion");
        el.hidden = false;
        el.style.cursor = "pointer";
        el.onclick = () => { w.postMessage({ type: "SKIP_WAITING" }); };
        setTimeout(() => { el.hidden = true; el.onclick = null; }, 12000);
      };
      if (reg.waiting) offer(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        nw && nw.addEventListener("statechange", () => { if (nw.state === "installed" && navigator.serviceWorker.controller) offer(nw); });
      });
    }).catch(() => {});
// 新版本接管后自动刷新一次（只刷一次，避免循环）
navigator.serviceWorker.addEventListener("controllerchange", () => {
  if (sessionStorage.getItem("sw-reloaded")) return;
  sessionStorage.setItem("sw-reloaded", "1");
  location.reload();
});
  });
}
