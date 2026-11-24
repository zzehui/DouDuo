// 豆多成册 · 标书整编
// 编排层：加载 → 合并 → 标章节 → 页码/目录/书签/水印 → 导出
import { merge } from "./core.js";
import { makeSearchable } from "./ocr.js";
import { addPageNumbers, insertToc, setOutline, fontFor, PAGE_TEMPLATES, SIZES, cm } from "./bind.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const CJK = /[\u3400-\u9fff]/;

const state = {
  files: [],        // {name, bytes}
  merged: null,     // Uint8Array
  chapters: [],     // {page,title,level}  page 从 1 开始
  picked: -1,
  busy: false,
};

/* ---------- 主题 / 语言 ---------- */
const THEME_KEY = "bidbook_theme";
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $("#themeBtn").textContent = t === "dark" ? "☀" : "☾";
}
applyTheme(localStorage.getItem(THEME_KEY) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
$("#themeBtn").onclick = () => {
  const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, t);
  applyTheme(t);
};

/* ---------- 小工具 ---------- */
function toast(msg, ms = 2600) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("on");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("on"), ms);
}
const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB");
function setStatus(s) { $("#status").textContent = s; }
function setBusy(b, label) {
  state.busy = b;
  $("#runBtn").disabled = b || !state.merged;
  if (label) setStatus(label);
}
function download(bytes, name) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- 文件加载 ---------- */
async function readFile(f) {
  const buf = new Uint8Array(await f.arrayBuffer());
  return { name: f.name, bytes: buf };
}

async function addFiles(list) {
  const pdfs = [...list].filter((f) => /\.pdf$/i.test(f.name));
  if (!pdfs.length) return toast("只支持 PDF");
  setBusy(true, "读取中…");
  for (const f of pdfs) state.files.push(await readFile(f));
  await rebuild();
}

async function rebuild() {
  renderFiles();
  if (!state.files.length) {
    state.merged = null;
    setStatus("还没有文件");
    $("#runBtn").disabled = true;
    $("#pgrid").innerHTML = "";
    return;
  }
  setStatus("合并中…");
  state.merged = await merge(state.files.map((f) => f.bytes));
  const n = await countPages(state.merged);
  state.chapters = state.chapters.filter((c) => c.page <= n);
  renderChapters();
  setStatus(`${state.files.length} 个文件 · ${n} 页`);
  setBusy(false);
  await renderThumbs();
}

async function countPages(bytes) {
  const lib = await import("./pdf-lib.esm.min.js");
  const doc = await lib.PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

function renderFiles() {
  $("#files").innerHTML = state.files
    .map((f, i) => `<div class="file"><span class="sz">${i + 1}</span><span class="nm">${f.name}</span>
      <span class="sz">${fmtSize(f.bytes.length)}</span>
      <button class="hbtn" data-rm="${i}">移除</button></div>`)
    .join("");
  $$("#files [data-rm]").forEach((b) => {
    b.onclick = async () => {
      state.files.splice(+b.dataset.rm, 1);
      await rebuild();
    };
  });
}

/* ---------- 缩略图 ---------- */
let _pdfjs = null;
async function getPdfjs() {
  if (!_pdfjs) {
    _pdfjs = await import("./vendor/pdfjs/pdf.min.mjs");
    _pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
  }
  return _pdfjs;
}

async function renderThumbs() {
  const box = $("#pgrid");
  box.innerHTML = "";
  if (!state.merged) return;
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: state.merged.slice() }).promise;
  const max = Math.min(doc.numPages, 200);
  for (let i = 1; i <= max; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 0.22 });
    const cv = document.createElement("canvas");
    cv.width = Math.ceil(vp.width);
    cv.height = Math.ceil(vp.height);
    await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
    const card = document.createElement("div");
    card.className = "pcard";
    card.dataset.page = i;
    card.appendChild(cv);
    const no = document.createElement("span");
    no.className = "no";
    no.textContent = i;
    card.appendChild(no);
    card.onclick = () => {
      state.picked = i;
      $$(".pcard").forEach((c) => c.classList.toggle("sel", +c.dataset.page === i));
      $("#pageAddCh").disabled = false;
      $("#pagePick").textContent = `已选第 ${i} 页`;
    };
    box.appendChild(card);
  }
  markChapterBadges();
  if (doc.numPages > max) {
    const tip = document.createElement("p");
    tip.className = "hint";
    tip.textContent = `只显示前 ${max} 页缩略图（共 ${doc.numPages} 页），导出不受影响。`;
    box.appendChild(tip);
  }
}

function markChapterBadges() {
  const byPage = new Map(state.chapters.map((c) => [c.page, c]));
  $$(".pcard").forEach((c) => {
    c.querySelector(".ch")?.remove();
    const ch = byPage.get(+c.dataset.page);
    if (ch) {
      const b = document.createElement("span");
      b.className = "ch";
      b.textContent = ch.level === 1 ? "章" : "节";
      c.appendChild(b);
    }
  });
}

/* ---------- 章节 ---------- */
function renderChapters() {
  const body = $("#chBody");
  const rows = [...state.chapters].sort((a, b) => a.page - b.page);
  body.innerHTML = rows.length
    ? rows
        .map(
          (c) => `<tr><td><input type="number" min="1" value="${c.page}" data-pg="${c.page}"></td>
        <td><input type="text" value="${c.title.replace(/"/g, "&quot;")}" data-tt="${c.page}" style="width:100%"></td>
        <td><select data-lv="${c.page}">${[1, 2, 3]
          .map((l) => `<option value="${l}"${l === c.level ? " selected" : ""}>${["一级", "二级", "三级"][l - 1]}</option>`)
          .join("")}</select></td>
        <td><button class="x" data-del="${c.page}">✕</button></td></tr>`
        )
        .join("")
    : `<tr><td colspan="4" class="hint">还没有章节。去「页面」标签点缩略图，或下面手动加一行。</td></tr>`;

  $$("#chBody [data-tt]").forEach((el) => {
    el.oninput = () => {
      const c = state.chapters.find((x) => x.page === +el.dataset.tt);
      if (c) c.title = el.value;
    };
  });
  $$("#chBody [data-lv]").forEach((el) => {
    el.onchange = () => {
      const c = state.chapters.find((x) => x.page === +el.dataset.lv);
      if (c) c.level = +el.value;
      markChapterBadges();
    };
  });
  $$("#chBody [data-del]").forEach((b) => {
    b.onclick = () => {
      state.chapters = state.chapters.filter((x) => x.page !== +b.dataset.del);
      renderChapters();
      markChapterBadges();
    };
  });
}

function addChapter(page, title, level = 1) {
  if (!page || page < 1) return;
  const t = (title || "").trim();
  if (!t) return toast("章节标题不能为空");
  state.chapters = state.chapters.filter((c) => c.page !== page);
  state.chapters.push({ page, title: t, level });
  renderChapters();
  markChapterBadges();
  toast(`已标：第 ${page} 页 · ${t}`);
}

/* ---------- 导出 ---------- */
async function exportBook() {
  if (!state.merged) return;
  const t0 = performance.now();
  setBusy(true, "处理中…");
  try {
    let bytes = state.merged;

    if ($("#ocrOn").checked) {
      setStatus("识别文字中…（每页约 3–5 秒）");
      const prog = $("#prog");
      prog.classList.add("on");
      bytes = await makeSearchable(bytes, {
        langs: $("#ocrLang").value,
        onProgress: (done, total) => {
          prog.querySelector("i").style.width = Math.round((done / total) * 100) + "%";
          setStatus(`识别文字 ${done}/${total} 页…`);
        },
      });
      prog.classList.remove("on");
    }

    if ($("#wmOn").checked) {
      const text = ($("#wmText").value || "内部资料").trim();
      const opacity = Math.min(0.5, Math.max(0.02, +$("#wmOpacity").value || 0.08));
      setStatus("加水印…");
      bytes = await stampWatermark(bytes, text, opacity);
    }

    const lib = await import("./pdf-lib.esm.min.js");
    const doc = await lib.PDFDocument.load(bytes, { ignoreEncryption: true });

    const fmt = $("#pnFormat").value;
    const title = $("#tocTitle").value || "目　录";
    const chapters = [...state.chapters].sort((a, b) => a.page - b.page);
    const needCJK =
      fmt === "zh" || fmt === "zhTotal" || CJK.test(title) || chapters.some((c) => CJK.test(c.title));

    let fontObj = null;
    let fontBytes = null;
    if (needCJK) {
      setStatus("加载中文字体…");
      const r = await fetch("./vendor/font/NotoSansSC-Regular.otf");
      fontBytes = new Uint8Array(await r.arrayBuffer());
      fontObj = await fontFor(doc, { cjk: true, bytes: fontBytes });
    }

    let tocPages = 0;
    if ($("#tocOn").checked && chapters.length) {
      setStatus("插入目录页…");
      const res = await insertToc(doc, chapters, {
        tocAt: Math.max(0, +$("#tocAt").value || 0),
        title,
        cjk: needCJK,
        fontBytes,
        fontObj,
      });
      tocPages = res.tocPages;
    }

    setStatus("加页码…");
    await addPageNumbers(doc, {
      format: fmt,
      size: SIZES[$("#pnSize").value] || 10.5,
      pos: $("#pnPos").value,
      startAt: Math.max(1, +$("#pnStart").value || 1),
      skipFirst: Math.max(0, +$("#pnSkip").value || 0),
      fontObj: fontObj || undefined,
    });

    if ($("#bmOn").checked && chapters.length) {
      setStatus("写书签…");
      setOutline(doc, [...state.chapters].sort((a, b) => a.page - b.page), { offset: tocPages });
    }

    doc.setTitle("豆多成册导出");
    doc.setProducer("DOUDUO BidBook");
    setStatus("保存…");
    const out = await doc.save();
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    download(out, `成册-${stamp}.pdf`);
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    setStatus(`完成 · ${fmtSize(out.length)} · ${secs}s`);
    toast("导出完成，原文件没有改动");
  } catch (e) {
    console.error(e);
    setStatus("失败：" + (e && e.message ? e.message : e));
    toast("导出失败：" + (e && e.message ? e.message : "未知错误"), 5000);
  } finally {
    setBusy(false);
  }
}

async function stampWatermark(bytes, text, opacity) {
  const lib = await import("./pdf-lib.esm.min.js");
  const doc = await lib.PDFDocument.load(bytes, { ignoreEncryption: true });
  const fontBytes = new Uint8Array(await (await fetch("./vendor/font/NotoSansSC-Regular.otf")).arrayBuffer());
  const font = await fontFor(doc, { cjk: true, bytes: fontBytes });
  const size = 42;
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: (width - w) / 2,
      y: height * 0.42,
      size,
      font,
      color: lib.rgb(0.5, 0.5, 0.5),
      opacity,
      rotate: lib.degrees(30),
    });
  }
  return doc.save();
}

/* ---------- 交互绑定 ---------- */
const drop = $("#drop");
["dragenter", "dragover"].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("hot"); })
);
["dragleave", "drop"].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("hot"); })
);
drop.addEventListener("drop", (e) => { if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });
$("#pickBtn").onclick = () => $("#fileInput").click();
$("#fileInput").onchange = (e) => { if (e.target.files.length) addFiles(e.target.files); e.target.value = ""; };

$$(".tab").forEach((t) => {
  t.onclick = () => {
    $$(".tab").forEach((x) => x.classList.toggle("on", x === t));
    ["bind", "page", "ocr", "wm"].forEach((m) => {
      const sec = $("#opt-" + m);
      if (sec) sec.hidden = m !== t.dataset.mode;
    });
  };
});

$("#chAdd").onclick = () => {
  addChapter(+$("#chPage").value, $("#chTitle").value, +$("#chLevel").value || 1);
  $("#chPage").value = "";
  $("#chTitle").value = "";
};
$("#pageAddCh").onclick = () => {
  if (state.picked < 0) return;
  addChapter(state.picked, prompt("这一页的章节标题（如：第二章 技术方案）") || "", 1);
};
$("#runBtn").onclick = exportBook;

$("#langBtn").onclick = () => toast("英文版稍后加；现在界面是中文");
