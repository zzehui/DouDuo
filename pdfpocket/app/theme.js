// 主题：localStorage 记住选择（同步读，避免首屏闪一下）；没选过就跟随系统
(function () {
  var saved = null;
  try { saved = localStorage.getItem("theme"); } catch (e) {}
  // 默认浅色（更轻），用户手动切过才尊重选择
  var theme = saved === "light" || saved === "dark" ? saved : "light";
  document.documentElement.setAttribute("data-theme", theme);
  window.__applyTheme = function (next) {
    // 切主题时先关掉过渡，避免整页"褪色"动画（也避免测试截图拍到中间色）
    document.documentElement.classList.add("theme-switching");
    document.documentElement.setAttribute("data-theme", next);
    void document.documentElement.offsetWidth;
    setTimeout(function () { document.documentElement.classList.remove("theme-switching"); }, 80);
    try { localStorage.setItem("theme", next); } catch (e) {}
    document.dispatchEvent(new CustomEvent("themechange", { detail: next }));
  };
  window.__theme = theme;
})();
