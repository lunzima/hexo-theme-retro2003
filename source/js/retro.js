/* retro2003 lightweight interactivity — 2003-era DHTML only */
(function () {
  'use strict';

  // 1) 侧栏小节的折叠。是可键盘操作、可被读屏识别的展开/收起控件，
  //    指示符（+ / −）由 CSS 依 aria-expanded 画在标题右端。
  document.querySelectorAll('.box-title').forEach(function (h) {
    var body = h.nextElementSibling;
    if (!body) return;
    h.setAttribute('role', 'button');
    h.setAttribute('tabindex', '0');
    h.setAttribute('aria-expanded', 'true');
    h.title = '点击折叠/展开';
    function toggle() {
      var open = h.getAttribute('aria-expanded') === 'true';
      h.setAttribute('aria-expanded', open ? 'false' : 'true');
      body.hidden = open;
    }
    h.addEventListener('click', toggle);
    h.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });

  // 2) 快速索引下拉（移植自存档页的 load(form)）
  //    用 location.href 而不是 window.open：这是站内跳转，没有理由开新标签
  document.querySelectorAll('.quick-index').forEach(function (sel) {
    sel.addEventListener('change', function () {
      if (sel.value) location.href = sel.value;
    });
  });

  // 3) 内容卡片入场淡入（只动 opacity，prefers-reduced-motion 下由 CSS 关掉）
  document.querySelectorAll('.content-box, .card').forEach(function (el, i) {
    el.classList.add('fade-in');
    el.style.animationDelay = (i * 60) + 'ms';
  });
})();

/* 4) 站内搜索。索引是静态 JSON，页面加载时不请求 ——
      聚焦输入框或提交时才取第一次，之后复用（索引不进首屏关键路径）。 */
(function () {
  var form = document.querySelector('.masthead-search');
  var input = document.getElementById('search-input');
  var box = document.getElementById('search-results');
  if (!form || !input || !box) return;

  var idx = null, loading = false, want = false, failed = false;

  function load(cb) {
    if (idx) return cb();
    if (loading) { want = true; return; }
    loading = true; failed = false;
    var x = new XMLHttpRequest();
    x.open('GET', '/search.json', true);
    // 三种结果必须互相可区分：加载失败 / 还在取 / 取到了但没匹配（文案各不相同）。
    // 失败时 idx 保持 null（下次聚焦即重试）；置成 [] 就会让前两者与「没有匹配」同一句话。
    x.onload = function () {
      loading = false;
      if (x.status < 200 || x.status >= 300) { failed = true; idx = null; }
      else {
        try { idx = JSON.parse(x.responseText); }
        catch (e) { failed = true; idx = null; }
      }
      cb();
      if (want) { want = false; render(); }
    };
    x.onerror = function () { loading = false; failed = true; idx = null; cb(); };
    x.send();
  }

  // 看板娘的问号（ParamC）跟着搜索结果走。只在「真的无匹配」时出表情：
  //   加载失败是错误态，不出；「正在加载」不表态（避免闪）；清空输入 / 有结果 → 收回常态。
  //   进/出成对、可恢复。
  function poseQ(on) {
    if (window.l2dPose && window.l2dPose.q) window.l2dPose.q(!!on);
  }
  function render() {
    var q = input.value.trim().toLowerCase();
    if (!q) { box.hidden = true; box.innerHTML = ''; poseQ(false); return; }
    var html, noMatch = null;
    if (failed) {
      html = '<p class="search-empty">搜索索引加载失败，请稍后重试。</p>';
      noMatch = false;                 // 错误态：不出表情
    } else if (!idx) {
      html = '<p class="search-empty">正在加载搜索索引…</p>';
      noMatch = null;                  // 还不知道，不表态
    } else {
      var hits = idx.filter(function (p) {
        return (p.title + ' ' + p.text).toLowerCase().indexOf(q) > -1;
      }).slice(0, 8);
      html = hits.length
        ? '<ul>' + hits.map(function (p) {
            return '<li><a href="' + p.url + '">' + p.title + '</a>' +
                   '<span class="search-date">' + p.date + '</span></li>';
          }).join('') + '</ul>'
        : '<p class="search-empty">没有找到匹配的文章。</p>';
      noMatch = !hits.length;
    }
    if (noMatch !== null) poseQ(noMatch);
    box.innerHTML = html;
    box.hidden = false;
  }

  // 先 render 再 load：render 负责显示「正在加载索引…」；写成 load(render) 的话加载期间
  // 一次都不 render，那句话永远看不到。
  function run() { render(); load(render); }
  input.addEventListener('focus', function () { load(function () {}); });
  input.addEventListener('input', run);
  form.addEventListener('submit', function (e) { e.preventDefault(); run(); });
  document.addEventListener('click', function (e) {
    if (!form.contains(e.target)) box.hidden = true;
  });
})();
