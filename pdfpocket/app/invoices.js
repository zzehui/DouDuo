// 发票信息提取：从 OCR 文本里抠字段。不用模板坐标，纯文本规则——发票版式多，
// 坐标法一换版式就废；文本法只要关键字还在就能取到。
const NUM = '[0-9０-９]';
const money = (s) => {
  const m = String(s).replace(/[，,\s]/g, '').match(/([0-9]+(?:\.[0-9]{1,2})?)/);
  return m ? m[1] : '';
};

export function extractInvoice(text) {
  const t = String(text || '').replace(/\u00a0/g, ' ');
  const pick = (re) => { const m = t.match(re); return m ? (m[1] || '').trim() : ''; };

  let no = pick(new RegExp('发票号码[:：\\s]*(' + NUM + '{8,24})'));
  if (!no) no = pick(/invoice\s*(?:no\.?|number)[:：\s#]*([A-Za-z0-9-]{4,24})/i);
  const code = pick(new RegExp('发票代码[:：\\s]*(' + NUM + '{10,16})'));
  let date = pick(/开票日期[:：\s]*([0-9]{4}\s*年\s*[0-9]{1,2}\s*月\s*[0-9]{1,2}\s*日)/);
  if (!date) date = pick(new RegExp('开票日期[:：\\s]*(' + NUM + '{4}[-/.]' + NUM + '{1,2}[-/.]' + NUM + '{1,2})'));

  // 价税合计（小写）
  let total = '';
  const totalM = t.match(new RegExp('价税合计[^0-9¥￥]{0,12}[¥￥]?\\s*([0-9][0-9,，]*\\.?[0-9]{0,2})'));
  if (totalM) total = money(totalM[1]);
  if (!total) {
    const alt = t.match(new RegExp('[（(]\\s*小写\\s*[）)][^0-9¥￥]{0,6}[¥￥]?\\s*([0-9][0-9,，]*\\.?[0-9]{0,2})'));
    if (alt) total = money(alt[1]);
  }

  if (!total) {
    const et = t.match(/total[^0-9]{0,12}[$€£¥]?\s*([0-9][0-9,]*\.[0-9]{2})/i);
    if (et) total = money(et[1]);
  }
  const tax = (() => {
    const m = t.match(new RegExp('税额[^0-9¥￥]{0,10}[¥￥]?\\s*([0-9][0-9,，]*\\.[0-9]{2})'));
    return m ? money(m[1]) : '';
  })();

  // 销售方名称：在「销售方」那一行取，同行为空就看下一行。
  // 不能简单取「后面第一段」——OCR 出来的行序常常是「销售方名称：」和公司名分两行。
  const lines = t.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  const BAD = /(名称|纳税人|识别号|地址|电话|开户|账号|金额|税额|合计|货物|服务|项目|税率)/;
  const clean = (v) => v.replace(/销售方|名称/g, '').replace(/^[：:\s]+/, '').replace(/\s{2,}/g, ' ').trim();
  let seller = '';
  for (let i = 0; i < lines.length; i++) {
    if (!/销售方/.test(lines[i])) continue;
    const same = clean(lines[i].replace(/^.*?销售方/, ''));
    if (same.length >= 4 && !BAD.test(same)) { seller = same; break; }
    const next = lines[i + 1] ? clean(lines[i + 1]) : '';
    if (next.length >= 4 && !BAD.test(next)) { seller = next; break; }
  }
  if (!seller) {
    const cm = t.match(/([^\n]{2,40}(?:有限公司|有限责任公司|股份有限公司|事务所|经营部|商店))/);
    if (cm) seller = clean(cm[1]);
  }
  seller = seller.slice(0, 40);

  return { no, code, date, seller, total, tax };
}

export function toCsv(rows) {
  const head = ['文件名', '页码', '发票号码', '发票代码', '开票日期', '销售方', '价税合计', '税额'];
  const esc = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [head.map(esc).join(',')];
  for (const r of rows) {
    lines.push([r.file, r.page, r.no, r.code, r.date, r.seller, r.total, r.tax].map(esc).join(','));
  }
  // BOM：Excel 打开中文不乱码
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}
