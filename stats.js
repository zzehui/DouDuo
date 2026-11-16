/* DOUDUO 访问计数：同域脚本，仅向自家 Worker 取两个累计数字，不写 Cookie */
(function () {
  var API = "https://douduo-stats.douduotech.workers.dev";
  var el = document.getElementById("visitStat");
  var off = false;
  try { off = localStorage.getItem("dd_notrack") === "1"; } catch (e) {}
  if (!off) {
    fetch(API + "/hit", {
      method: "POST", mode: "cors", keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ surface: "web", page: location.pathname })
    }).catch(function () {});
  }
  if (!el) return;
  fetch(API + "/total", { mode: "cors" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.ok || !d.visits) return;
      el.textContent = "本站累计 " + d.visits + " 次访问 · " + d.visitors + " 位访客";
      el.hidden = false;
    })
    .catch(function () {});
})();
