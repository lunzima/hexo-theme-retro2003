(function () {
  var DATA = window.__BGM__;
  var host = document.getElementById('bgm-player');
  if (!DATA || !DATA.tracks || !DATA.tracks.length || !host) return;

  // 没有任何可用源就不注入（跟看板娘「能力检测通过才加载」同构）
  var probe = document.createElement('audio');
  if (!probe.canPlayType) return;
  if (!probe.canPlayType('audio/webm; codecs=opus')) return;

  var LS = 'bgm.', TRACKS = DATA.tracks;
  var STEP = 10;                       // 音量十档
  // SVG2 的无命名空间 href 要 Chrome 50 / Firefox 51 / Safari 12.1，
  // 老内核（含 EdgeHTML）只认 xlink:href，两个都得设
  var XLINK = 'http://www.w3.org/1999/xlink';

  function ls(k, d) {
    try { var v = localStorage.getItem(LS + k); return v === null ? d : v; } catch (e) { return d; }
  }
  function lset(k, v) { try { localStorage.setItem(LS + k, v); } catch (e) {} }
  function ss(k, d) {
    try { var v = sessionStorage.getItem(LS + k); return v === null ? d : v; } catch (e) { return d; }
  }
  function sset(k, v) { try { sessionStorage.setItem(LS + k, v); } catch (e) {} }

  var idx = parseInt(ls('track', '0'), 10) || 0;
  if (idx < 0 || idx >= TRACKS.length) idx = 0;
  var state = {
    idx: idx,
    playing: false,
    collapsed: ls('collapsed', '0') === '1',
    x: parseInt(ls('x', ''), 10),
    y: parseInt(ls('y', ''), 10),
    vol: parseInt(ls('vol', String(STEP)), 10),
    muted: ls('muted', '0') === '1'
  };
  // localStorage 里的 vol 可能是 NaN / 负数 / 越界；audio.volume 抛 TypeError
  // 会让整个 IIFE 中断、播放器不出现，所以在这里兜住
  if (!(state.vol >= 0 && state.vol <= STEP)) state.vol = STEP;

  var audio = document.createElement('audio');
  audio.preload = 'none';
  // 不设 loop：播完一首按列表顺序进下一首，最后一首之后绕回第一首（见 ended 那段）。
  audio.volume = state.muted ? 0 : state.vol / STEP;

  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function icon(id, cls) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'bgm-ico ' + cls);
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + id);
    use.setAttributeNS(XLINK, 'xlink:href', '#' + id);
    svg.appendChild(use);
    return svg;
  }

  // 图标一律画成抗锯齿的实形，不用 shape-rendering: crispEdges 去拼整数矩形 ——
  // 那样三角是台阶、方块偏小。尺寸取奇数是为了在 19×13 的内容盒里整数居中。
  var SPRITE = '<svg style="display:none" aria-hidden="true">'
    + '<symbol id="bgm-play" viewBox="0 0 7 9"><path d="M0 0 L7 4.5 L0 9 Z"/></symbol>'
    // 两根杠各 3 单位、间距 1，两侧各留 1。划成 9 宽、起点取 1 与 5 是实测定下来的：
    // 分数缩放下浏览器会按设备像素吸附轴对齐矩形的边，两根杠就一宽一窄；而吸附看的是
    // 每根杠的绝对位置，不是只看间距，所以推不出来、只能量。改这里必须逐档 dpr 重测。
    + '<symbol id="bgm-pause" viewBox="0 0 9 9">'
    + '<rect x="1" y="0" width="3" height="9"/><rect x="5" y="0" width="3" height="9"/></symbol>'
    + '<symbol id="bgm-stop" viewBox="0 0 7 7"><rect x="0" y="0" width="7" height="7"/></symbol>'
    + '<symbol id="bgm-min" viewBox="0 0 6 1"><rect x="0" y="0" width="6" height="1"/></symbol>'
    // 收起态方块里的「圆盘 + 播放三角」。圆盘取 fill、三角取 currentColor，靠两个属性分两色。
    // r 取 8.5 不是 9：取 9 时圆正好顶到 viewBox 边界，而 SVG 默认 overflow:hidden，
    // 抗锯齿的那半圈边会被切掉。
    + '<symbol id="bgm-disc" viewBox="0 0 18 18">'
    + '<circle cx="9" cy="9" r="8.5"/>'
    // 三角往右推 0.5 单位：右向三角按几何居中会显得偏左，要推一点；但这枚只有 7 单位宽，
    // 推多了整个图标的视觉重心会右移。
    + '<path d="M6 4.5 L13 9 L6 13.5 Z" fill="currentColor"/></symbol>'
    // 喇叭：箱体 + 张开的锥 + 一道弧（弧用 stroke，fill 显式关掉，免得被 .bgm-ico 的 fill 填死）
    + '<symbol id="bgm-vol" viewBox="0 0 9 9">'
    + '<path d="M0 3 H2 L5 0 V9 L2 6 H0 Z"/>'
    + '<path d="M6.6 2.6 A3.4 3.4 0 0 1 6.6 6.4" fill="none" stroke="currentColor" stroke-width="1.2"/>'
    + '</symbol>'
    + '</svg>';
  host.insertAdjacentHTML('beforeend', SPRITE);

  var root = el('div', 'bgm');
  var bar = el('div', 'bgm-bar');

  var title = el('div', 'bgm-t');
  title.appendChild(el('span', null, '正在播放'));
  var minBtn = el('button', 'bgm-min');
  minBtn.type = 'button';
  minBtn.setAttribute('aria-label', '收起播放器');
  minBtn.setAttribute('title', '收起');
  minBtn.appendChild(icon('bgm-min', 'bgm-ico-min'));
  title.appendChild(minBtn);

  var row1 = el('div', 'bgm-row');
  var lcd = el('div', 'bgm-lcd', '0:00');
  var name = el('div', 'bgm-name');
  row1.appendChild(lcd);
  row1.appendChild(name);

  var seekWrap = el('div', 'bgm-seekwrap');
  var seek = el('div', 'bgm-seek');
  var seekFill = el('i');
  seek.appendChild(seekFill);
  var seekThumb = el('div', 'bgm-thumb');
  var seekIn = el('input', 'bgm-range');
  seekIn.type = 'range';
  seekIn.min = '0'; seekIn.max = '1000'; seekIn.step = '1'; seekIn.value = '0';
  seekIn.setAttribute('aria-label', '播放进度');
  seekWrap.appendChild(seek);
  seekWrap.appendChild(seekThumb);
  seekWrap.appendChild(seekIn);

  var row2 = el('div', 'bgm-btns');
  var playBtn = el('button', 'bgm-btn');
  playBtn.type = 'button';
  playBtn.setAttribute('aria-label', '播放');
  playBtn.appendChild(icon('bgm-play', 'bgm-ico-play'));
  var stopBtn = el('button', 'bgm-btn');
  stopBtn.type = 'button';
  stopBtn.setAttribute('aria-label', '停止');
  stopBtn.appendChild(icon('bgm-stop', 'bgm-ico-stop'));
  var spacer = el('span', 'bgm-spacer');
  var volGroup = el('span', 'bgm-volgroup');
  var spk = el('button', 'bgm-spk');
  spk.type = 'button';
  spk.setAttribute('aria-label', '静音');
  spk.appendChild(icon('bgm-vol', 'bgm-ico-vol'));
  var volWrap = el('span', 'bgm-volwrap');
  var ramp = el('span', 'bgm-ramp');
  var volThumb = el('div', 'bgm-thumb');
  var volIn = el('input', 'bgm-range');
  volIn.type = 'range';
  volIn.min = '0'; volIn.max = String(STEP); volIn.step = '1';
  volIn.value = String(state.vol);
  volIn.setAttribute('aria-label', '音量');
  volWrap.appendChild(ramp);
  volWrap.appendChild(volThumb);
  volWrap.appendChild(volIn);
  volGroup.appendChild(spk);
  volGroup.appendChild(volWrap);
  var listBtn = el('button', 'bgm-trackbtn', '曲目');
  listBtn.type = 'button';
  listBtn.setAttribute('aria-label', '曲目表');
  row2.appendChild(playBtn);
  row2.appendChild(stopBtn);
  row2.appendChild(spacer);
  row2.appendChild(volGroup);
  row2.appendChild(listBtn);

  var list = el('div', 'bgm-list');
  for (var i = 0; i < TRACKS.length; i++) {
    var t = TRACKS[i];
    var b = el('button', 'bgm-row2');
    b.type = 'button';
    b.appendChild(el('span', null, t.name));
    b.appendChild(el('em', null, fmt(t.seconds)));
    b.setAttribute('data-i', String(i));
    list.appendChild(b);
  }

  bar.appendChild(title);
  bar.appendChild(row1);
  bar.appendChild(seekWrap);
  bar.appendChild(row2);
  bar.appendChild(list);
  root.appendChild(bar);

  var tab = el('button', 'bgm-tab');
  tab.type = 'button';
  tab.setAttribute('aria-label', '展开播放器');
  tab.appendChild(icon('bgm-disc', 'bgm-ico-disc'));
  root.appendChild(tab);

  host.appendChild(root);
  host.hidden = false;

  var seeking = false;                  // 本次拖过进度条，别拿 sessionStorage 的旧位置盖
  var rewarm = function () {};          // 预读 IIFE 会换成真正的重置入口

  function track() { return TRACKS[state.idx]; }

  function paintTrack() {
    name.textContent = track().name;
    name.setAttribute('title', track().name);
    lcd.textContent = fmt(track().seconds);
    for (var i = 0; i < list.children.length; i++) {
      var on = i === state.idx;
      list.children[i].className = on ? 'bgm-row2 bgm-cur' : 'bgm-row2';
    }
    // sessionStorage 里的位置只在同一首时才算数
    var pos = parseFloat(ss('pos', '0')) || 0;
    var same = ss('track', '') === String(state.idx);
    applyPos(same ? pos : 0);
  }

  // 进度滑块的几何要吸到设备像素。分数缩放下 5px 宽是 6.25 设备像素，而滑块位置随播放
  // 连续变化，吸附后的宽就在 6 与 7 之间跳；上下各凸 2px 是 2.5 设备像素，吸附后两侧
  // 会差一个。CSS 里的数值本身是对称的，是栅格化引入的 —— 所以位置（applyPos）与
  // 宽高（fitSeek）都取设备像素的整数倍。
  var seekW = 0, seekDpr = 1;
  function snapDev(v) { return Math.round(v * seekDpr) / seekDpr; }

  function fitSeek() {
    seekDpr = window.devicePixelRatio || 1;
    seekW = seekWrap.clientWidth;
    var above = snapDev(2);            // 每侧凸出多少，吸过之后两侧才是同一个值
    var trackH = snapDev(9);           // 凹槽的设备高
    seek.style.top = above + 'px';
    seek.style.height = trackH + 'px';
    seekThumb.style.width = snapDev(5) + 'px';
    seekThumb.style.height = (trackH + 2 * above) + 'px';
  }

  function applyPos(sec) {
    var total = track().seconds || 1;
    if (sec < 0) sec = 0;
    if (sec > total) sec = total;
    var pct = sec / total;
    if (!seekW) fitSeek();
    seekFill.style.width = (pct * 100) + '%';
    seekThumb.style.left = (Math.round(pct * seekW * seekDpr) / seekDpr) + 'px';
    lcd.textContent = fmt(state.playing || sec > 0 ? sec : track().seconds);
  }

  function paintPlay() {
    playBtn.setAttribute('aria-label', state.playing ? '暂停' : '播放');
    playBtn.className = state.playing ? 'bgm-btn bgm-on' : 'bgm-btn';
    // 换图元。href 与 xlink:href 都要设，理由同顶上的 XLINK。
    var use = playBtn.firstChild.firstChild;
    use.setAttribute('href', state.playing ? '#bgm-pause' : '#bgm-play');
    use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href',
      state.playing ? '#bgm-pause' : '#bgm-play');
    playBtn.firstChild.setAttribute('class',
      state.playing ? 'bgm-ico bgm-ico-pause' : 'bgm-ico bgm-ico-play');
  }

  function paintVol() {
    var lvl = state.muted ? 0 : state.vol;
    ramp.style.setProperty('--fill', (lvl * 3) + 'px');
    volThumb.style.left = (lvl * 3 - 2) + 'px';
    spk.className = state.muted ? 'bgm-spk bgm-muted' : 'bgm-spk';
    spk.setAttribute('aria-pressed', state.muted ? 'true' : 'false');
    audio.volume = state.muted ? 0 : state.vol / STEP;
  }

  function paintCollapsed() {
    root.className = state.collapsed ? 'bgm bgm-collapsed' : 'bgm';
    tab.setAttribute('aria-expanded', state.collapsed ? 'false' : 'true');
    clampPlace();
  }

  function play() {
    if (!audio.src) audio.src = track().src;
    if (!state.playing) sset('track', String(state.idx));
    var p = audio.play();
    // 老浏览器返回 undefined；play() 被拦时抛错是用 Promise 拒的（新浏览器）
    if (p && p['catch']) p['catch'](function () { state.playing = false; paintPlay(); });
  }

  function toggle() {
    if (state.playing) {
      audio.pause();
      state.playing = false;
      paintPlay();
      updateMediaSession();
      return;
    }
    // 还原记忆位置：有记忆值、还没定位过（currentTime < 0.5）、本次没拖过进度条才还原。
    // 不能拿 readyState 当门 —— warm() 可能进站就拉好 metadata，点播放时它已经是 1，
    // 按 readyState===0 判会整个跳过。readyState 0 时等 metadata 再设，否则直接设。
    var pos = parseFloat(ss('pos', '0')) || 0;
    if (!seeking && ss('track', '') === String(state.idx) && pos > 0.5 && audio.currentTime < 0.5) {
      if (audio.readyState === 0) {
        audio.addEventListener('loadedmetadata', function once() {
          audio.removeEventListener('loadedmetadata', once);
          try { audio.currentTime = pos; } catch (e) {}
        });
      } else {
        try { audio.currentTime = pos; } catch (e) {}
      }
    }
    state.playing = true;
    paintPlay();
    play();
    updateMediaSession();
  }

  function stop() {
    audio.pause();
    state.playing = false;
    try { audio.currentTime = 0; } catch (e) {}
    sset('pos', '0');
    seeking = false;
    applyPos(0);
    paintPlay();
    updateMediaSession();
  }

  function pick(i) {
    state.idx = i;
    lset('track', String(i));
    var was = state.playing;
    audio.pause();
    state.playing = false;
    audio.removeAttribute('src');   // 丢掉上一首的缓冲，换歌才重新下
    try { audio.load(); } catch (e) {}
    sset('pos', '0');
    sset('track', String(i));
    seeking = false;
    paintTrack();
    paintPlay();
    if (was) { state.playing = true; paintPlay(); play(); updateMediaSession(); }
    rewarm();
  }

  // 作者名取自 DATA.artist（主题配置里可能留空）。留空时索性不带 artist 这个键 ——
  // 传空串会在锁屏/媒体键那里留一个空行。
  function updateMediaSession() {
    if (!window.navigator || !navigator.mediaSession || !window.MediaMetadata) return;
    try {
      var meta = { title: track().name };
      if (DATA.artist) meta.artist = DATA.artist;
      navigator.mediaSession.metadata = new window.MediaMetadata(meta);
      navigator.mediaSession.playbackState = state.playing ? 'playing' : 'paused';
    } catch (e) {}
  }

  playBtn.onclick = toggle;
  stopBtn.onclick = stop;
  spk.onclick = function () {
    state.muted = !state.muted;
    lset('muted', state.muted ? '1' : '0');
    paintVol();
  };
  minBtn.onclick = function () {
    state.collapsed = true; lset('collapsed', '1'); paintCollapsed();
  };
  tab.onclick = function () {
    state.collapsed = false; lset('collapsed', '0'); paintCollapsed();
  };
  listBtn.onclick = function () {
    root.className = root.className.indexOf('bgm-open') < 0
      ? (state.collapsed ? 'bgm bgm-collapsed bgm-open' : 'bgm bgm-open')
      : (state.collapsed ? 'bgm bgm-collapsed' : 'bgm');
  };
  for (var i = 0; i < list.children.length; i++) {
    list.children[i].onclick = (function (i) {
      return function () { pick(i); };
    })(i);
  }

  volIn.oninput = function () {
    state.vol = parseInt(volIn.value, 10) || 0;
    if (state.muted) { state.muted = false; lset('muted', '0'); }
    lset('vol', String(state.vol));
    paintVol();
  };

  seekIn.oninput = function () {
    var total = track().seconds || 1;
    var sec = (parseInt(seekIn.value, 10) / 1000) * total;
    seeking = true;
    try { audio.currentTime = sec; } catch (e) {}
    sset('pos', String(sec));
    sset('track', String(state.idx));
    applyPos(sec);
  };

  audio.addEventListener('timeupdate', function () {
    if (!state.playing) return;
    applyPos(audio.currentTime);
    sset('pos', String(audio.currentTime));
    sset('track', String(state.idx));
  });
  // 一首放完就按列表顺序进下一首，到最后一首之后绕回第一首 —— 这是背景音乐，
  // 不该自己停下来。pick() 会看 state.playing：放完时它还是 true，所以新的一首接着播。
  audio.addEventListener('ended', function () {
    pick((state.idx + 1) % TRACKS.length);
  });
  // 出错后清失败态才能再播：src 还在时 play() 的 !audio.src 不成立，
  // NETWORK_NO_SOURCE 下 play() 也不重走资源选择。removeAttribute + load()
  // 只发 abort/emptied，不会再触发 error。
  audio.addEventListener('error', function () {
    state.playing = false;
    seeking = false;
    audio.removeAttribute('src');
    try { audio.load(); } catch (e) {}
    lcd.textContent = fmt(track().seconds);
    paintPlay();
    updateMediaSession();
  });
  window.addEventListener('pagehide', function () {
    if (audio.currentTime > 0) {
      sset('pos', String(audio.currentTime));
      sset('track', String(state.idx));
    }
  });

  // 尺寸缓存。place() 每次 mousemove 都要跑，而它上一次刚写过 host 的 left/top ——
  // 这时候再读 offsetWidth，浏览器为了给出准确值会立刻重算布局（写-读交替 = 每帧强制重排），
  // 拖动因此跟不上手。所以只在手势开始、收起/展开与 resize 时量一次。
  var boxW = 0, boxH = 0;
  function measure() {
    // 量 root 而不是 bar：收起态下 bar 是 display:none，offsetWidth 是 0，
    // 拿它算 maxX 会把 28×28 的方块拖出屏幕右沿
    boxW = root.offsetWidth;
    boxH = root.offsetHeight;
  }

  function place(x, y) {
    if (!boxW || !boxH) measure();
    var maxX = Math.max(0, window.innerWidth - boxW);
    var maxY = Math.max(0, window.innerHeight - boxH);
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x > maxX) x = maxX;
    if (y > maxY) y = maxY;
    state.x = x;
    state.y = y;
    // 写 host 不写 root：host 是 position:fixed 的那个，left/top 才是视口坐标；
    // root 是 position:relative，在它上面设 left/top 是「相对正常位置的偏移」，
    // 绝对坐标会被当成偏移再叠一次。
    host.style.right = 'auto';
    host.style.bottom = 'auto';
    host.style.left = x + 'px';
    host.style.top = y + 'px';
  }
  function clampPlace() {
    measure();
    if (isFinite(state.x) && isFinite(state.y)) place(state.x, state.y);
  }
  window.addEventListener('resize', function () { clampPlace(); fitSeek(); });

  (function () {
    var dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;

    function down(cx, cy) {
      var r = root.getBoundingClientRect();
      measure();          // 手势开始量一次，之后整段拖动都不再读布局
      dragging = true; moved = false;
      sx = cx; sy = cy;
      ox = r.left; oy = r.top;
    }
    function move(cx, cy) {
      if (!dragging) return;
      if (!moved) {
        var dx = cx - sx, dy = cy - sy;
        if (dx * dx + dy * dy < 16) return;      // 4px 阈值
        moved = true;
      }
      place(Math.round(ox + cx - sx), Math.round(oy + cy - sy));
      return false;
    }
    function up() {
      if (dragging && moved) {
        lset('x', String(state.x));
        lset('y', String(state.y));
      }
      dragging = false;
    }

    // 拖动区是标题条本身。它上面唯一的按钮是「收起」，在它上面按下不当作拖，
    // 否则一拖就把条子收掉了。
    title.addEventListener('mousedown', function (e) {
      if (e.target === minBtn) return;
      down(e.clientX, e.clientY);
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) { if (dragging) move(e.clientX, e.clientY); });
    document.addEventListener('mouseup', up);
    title.addEventListener('touchstart', function (e) {
      if (e.target === minBtn) return;
      var t = e.touches[0]; down(t.clientX, t.clientY);
    }, { passive: true });
    // 拖动期间每个 touchmove 都拦，不等 4px 阈值：iOS 在前几个像素就可能把触摸判成滚动，
    // 一旦开始滚动，后续 preventDefault 无效，手势会被系统 touchcancel 掐掉
    document.addEventListener('touchmove', function (e) {
      if (!dragging) return;
      if (e.cancelable) e.preventDefault();
      var t = e.touches[0];
      move(t.clientX, t.clientY);
    }, { passive: false });
    document.addEventListener('touchend', up);
    document.addEventListener('touchcancel', up);
    window.addEventListener('blur', up);

    clampPlace();
  })();

  // 窄屏默认收起成 28×28 的方块。与手动收起是同一个状态：只有用户没留过值时才按宽度定，
  // 留过就以他留的为准（否则每次从手机进来都会把他展开的条又折回去）。
  if (ls('collapsed', '') === '') state.collapsed = window.innerWidth <= 760;

  // 预读：首次进站没碰过播放器 → 一个字节都不下；鼠标停留 150ms / 键盘聚焦 / 按下按钮 →
  // 开始下当前曲；曾经播放过（记住的开关）→ 进站就预读。`ever` 就是「他表达过要听」。
  (function () {
    var warmed = false, timer = null;
    function warm() {
      if (warmed || state.playing) return;
      warmed = true;
      audio.preload = 'auto';
      if (!audio.src) audio.src = track().src;
      // 只有还没加载出任何东西时才 load()。load() 会重走资源选择、把 currentTime 归零，
      // 所以绝不能对一个已经在放/已经加载的元素调它。
      if (audio.readyState === 0) { try { audio.load(); } catch (e) {} }
    }
    function intent() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(warm, 150);      // 停留才算瞄准，路过不算
    }
    function cancel() { if (timer) { clearTimeout(timer); timer = null; } }

    bar.addEventListener('mouseover', intent);
    bar.addEventListener('mouseout', cancel);
    // 捕获阶段的 focus：focusin 要 Firefox 52 才有，老 Firefox 上那条监听根本不会触发。
    // focus 不冒泡，但捕获阶段挂在 bar 上能收到子孙的聚焦；warm 是幂等的，双触发无害。
    bar.addEventListener('focus', warm, true);
    bar.addEventListener('mousedown', warm);
    bar.addEventListener('touchstart', warm, { passive: true });
    playBtn.addEventListener('click', function () { lset('ever', '1'); });
    rewarm = function () {
      if (state.playing) { warmed = true; return; }   // 正在播就已经在下了，别记成「还没预读」
      warmed = false;
      warm();
    };
    if (ls('ever', '0') === '1') warm();                   // 他以前听过
  })();

  audio.addEventListener('waiting', function () { lcd.textContent = '载入中'; });
  audio.addEventListener('playing', function () { applyPos(audio.currentTime); });

  paintTrack(); paintPlay(); paintVol(); paintCollapsed();
})();
