(function () {
  /* 两态共用的观感常量：兜底图与模型墨迹用同一组数，「严格对齐 metric」由构造保证。
       MASCOT_H     = 160.59 —— 画的可见高度（原图 600×337、画高 246，× 220/337）。
       MASCOT_RIGHT = 153    —— 画距视口右缘，取自原图右侧透明留白 235 × 0.652819 ≈ 153.4。
                               不是贴角（用户定的位置），容器与模型墨迹都用它。
       MASCOT_BOTTOM = 0     —— 贴底。
     同高时宽差 0.79px（兜底画 133/246 vs 墨迹 107/197，本就是同一角色）—— 如实留下，
     禁止拉伸抹平。口径：「距右缘」按 clientWidth（可用宽度），不是 innerWidth
     （差一个滚动条宽）。 */
  var MASCOT_H = 160.59, MASCOT_RIGHT = 153, MASCOT_BOTTOM = 0;

  /* 站点相关的量一律取自主题配置 —— mascot.ejs 在容器前面输出 window.__L2D__：
       libs       要加载的库地址，按加载顺序（见下面 LOAD 那处的顺序约束）
       model_base 模型目录，里面要有 model.model3.json
       fallback   兜底静态图的地址，留空即「失败时什么都不显示」
       width/height 画布逻辑尺寸（单位是 CSS 像素）
       mobile     移动端是否显示，默认 false
     除尺寸外取不到一律回落空值：空 = 用户还没填自己的资源，不是运行期错误。 */
  var DATA = window.__L2D__ || {};
  var LIBS = DATA.libs || [];
  var MODEL_BASE = DATA.model_base || '';
  var FALLBACK = DATA.fallback || '';
  var WIDTH = DATA.width || 480, HEIGHT = DATA.height || 270;
  var MOBILE = !!DATA.mobile;

  // 容器偏移也走同一常量 —— 两态都挂在它里面，容器一挪、画与模型一起挪。
  (function () {
    var el = document.getElementById('L2dCanvas');
    if (el) { el.style.right = MASCOT_RIGHT + 'px'; el.style.bottom = MASCOT_BOTTOM + 'px'; }
  })();

  /* 能力检测。渲染器黑名单（/swiftshader|llvmpipe|softpipe|software|microsoft basic render/i）
     已按产品决定移除 —— 软件渲染的机器（虚拟机 / 云桌面 / 远程桌面 / 老集显）也要能用，
     代价是吃 CPU（已知并接受；限帧是现成的缓解手段）。剩下两条独立判断：
       ① 拿不到 WebGL 上下文 —— 真的画不了；
       ② hardwareConcurrency < 2 —— 单核机解不动 502 KB 贴图（与渲染器无关，别一起删）。
     三条失败路径都打 console.error 说明原因，正常路径一条日志都不打。 */
  function capable() {
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) {
        console.error('[看板娘] 能力检测不通过：拿不到 WebGL 上下文，退回静态图');
        return false;
      }
      if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 2) {
        console.error('[看板娘] 能力检测不通过：hardwareConcurrency = ' + navigator.hardwareConcurrency + '（< 2），退回静态图');
        return false;
      }
      return true;
    } catch (e) {
      console.error('[看板娘] 能力检测抛异常，退回静态图：', e);
      return false;
    }
  }

  // 兜底图按需注入，不写在初始 HTML 里（否则会被无条件下载）。
  // 黑名单移除后只有完全没有 WebGL 的机器才会走到这里；它是安全网，metric 对齐那套别删。
  // 本图 48,822 B（133×246，透明边已裁 —— 裁完反而比 41,826 B 大 7 KB，PNG 对大片平坦透明区
  // 压得更狠；但保留裁剪的理由是「盒 = 画」而不是体积）。懒加载路径，不进首屏。
  // ?nofallback 是对照开关：命中则不注入、只留一条说明，用来验证「禁用它屏幕不变 ⇒ 那是模型」。
  function noFallback() {
    return /(?:^|[?&])nofallback(?:[=&]|$)/.test(location.search);
  }
  function fallback() {
    if (noFallback()) {
      console.info('[看板娘] 已按 ?nofallback 禁用兜底图（画布之外不再叠静态图）');
      return;
    }
    // 主题配置里没填兜底图就什么都不显示：空地址会被 img.src 解析成当前页面地址，
    // 白白再请求一次文档本身。
    if (!FALLBACK) return;
    var el = document.getElementById('L2dCanvas');
    if (!el || document.getElementById('L2dFallback')) return;
    var img = document.createElement('img');
    img.id = 'L2dFallback';
    img.src = FALLBACK;
    img.alt = '看板娘';
    // 高度走 MASCOT_H（与模型墨迹同一个常量）；max-height 而非 height，窄屏由 max-width 保比例收下来。
    // ★ max-width 必须写 100%：100vw 含滚动条宽，而 right 贴的是 clientWidth，左缘会仍为负。
    img.style.cssText = 'display:block; max-height:' + MASCOT_H + 'px; max-width:100%; width:auto; height:auto;';
    el.appendChild(img);
  }

  if (!capable()) { fallback(); return; }

  // pixi-live2d-display 的 UMD 读 process.env.NODE_ENV，缺这个全局量会抛 ReferenceError、
  // 模块注册不完 ⇒ PIXI.live2d 拿不到 ⇒ 下面的存在性守卫直接 return，只剩静态图。
  if (typeof window.process === 'undefined') {
    window.process = { env: { NODE_ENV: 'production' } };
  }

  // 顺序有约束，不能只按体积排：Cubism Core 注册 window.Live2DCubismCore，
  // 而 pixi-live2d-display 的 cubism4 构建在模块求值时就去读它，排在它后面才认得模型。
  var LOAD = LIBS;
  // 哪个 src 没下来 —— onerror 必须记下来：静默 next 会让库 404/被拦时不报也不兜底。
  var LOAD_FAILED = [];
  function loadAll(list, done) {
    var i = 0;
    (function next() {
      if (i >= list.length) return done();
      var s = document.createElement('script');
      s.src = list[i++];
      s.onload = next;
      s.onerror = function () {
        LOAD_FAILED.push(this.src);
        console.error('[看板娘] 脚本加载失败：' + this.src);
        next();
      };
      document.body.appendChild(s);
    })();
  }
  var go = function () { loadAll(LOAD, initL2d); };
  (window.requestIdleCallback || window.requestAnimationFrame)(go);

  function initL2d() {
    // 移动端早退是设计如此，不是失败：所以只 console.info、每会话一次（不是 error，
    // 否则每次加载的红字会把真正的失败淹掉）。视觉行为不变。配置里把 mobile 打开就不早退。
    if (!MOBILE && /Mobile|Mac OS|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      try {
        if (!sessionStorage.getItem('l2d-ua-skipped')) {
          sessionStorage.setItem('l2d-ua-skipped', '1');
          console.info('[看板娘] 按 UA 早退（移动端不显示）。UA = ' + navigator.userAgent);
        }
      } catch (e) { /* 隐私模式下 sessionStorage 可能抛 —— 那就不去重，但仍要留一次原因 */ console.info('[看板娘] 按 UA 早退（移动端不显示）。UA = ' + navigator.userAgent); }
      return;
    }
    var el = document.getElementById('L2dCanvas');
    if (!el) {
      console.error('[看板娘] 容器 #L2dCanvas 不存在，无法初始化');
      return;
    }
    if (!window.PIXI || !PIXI.live2d || !PIXI.live2d.Live2DModel) {
      console.error('[看板娘] 库未就绪，退回静态图' +
        (LOAD_FAILED.length ? '。以下脚本没加载成功：' + LOAD_FAILED.join('、')
                            : '（脚本都触发了 onload，但运行时对象仍缺）'));
      fallback();
      return;
    }
    var canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    // PIXI 把配置里的逻辑尺寸写在 canvas 的属性上（固有尺寸）；不放开会在窄视口左溢
    // （默认 480 宽在 375 视口下越出 105px）。用 100% 而不是 100vw，理由见兜底图处。
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';
    el.appendChild(canvas);
    // autoStart:false 只停 app.ticker；模型挂在 PIXI.Ticker.shared 上，那半还在跑，
    // 会在我们不调用时推进模型（实测两次读数之间参数与画面都被冲掉）。真静止靠末尾的 shared.stop()。
    var app = new PIXI.Application({ view: canvas, width: WIDTH, height: HEIGHT, backgroundAlpha: 0, autoStart: false });
    PIXI.live2d.Live2DModel.from(MODEL_BASE + '/model.model3.json').then(function (model) {
      var natW = (model.internalModel && model.internalModel.width)  || model.width  || WIDTH;
      var natH = (model.internalModel && model.internalModel.height) || model.height || HEIGHT;
      var scale = Math.min(WIDTH / natW, HEIGHT / natH);
      model.scale.set(scale);
      model.position.set(0, 0);          // 真正的位置在下面 alignToMetric() 里定
      app.stage.addChild(model);
      if (model.update) model.update(0);
      app.render();
      // 目标：让模型的墨迹 bbox（readPixels 实测）与兜底图的画重合 —— 盒对盒，不是画对画。
      // 保比例、禁止拉伸（长宽比差留下的 0.79px 如实报出）。取上下文要走 app.renderer.gl。
      (function alignToMetric() {
        var gl = (app.renderer && app.renderer.gl) || app.view.getContext('webgl2') || app.view.getContext('webgl');
        if (!gl) return;
        function ink() {
          app.render();
          var px = new Uint8Array(WIDTH * HEIGHT * 4);
          gl.readPixels(0, 0, WIDTH, HEIGHT, gl.RGBA, gl.UNSIGNED_BYTE, px);
          var x0 = WIDTH, x1 = -1, y0 = HEIGHT, y1 = -1, x, y, cy;
          for (y = 0; y < HEIGHT; y++) for (x = 0; x < WIDTH; x++) {
            if (px[(y * WIDTH + x) * 4 + 3] > 8) {
              if (x < x0) x0 = x; if (x > x1) x1 = x;
              cy = HEIGHT - 1 - y; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
            }
          }
          return x1 < x0 ? null : { x0: x0, x1: x1, y0: y0, y1: y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
        }
        try {
          // 容器已按 MASCOT_RIGHT/MASCOT_BOTTOM 偏移，画布右缘/底即是目标右缘/底，
          // 所以墨迹右沿贴画布右缘、底沿贴画布底即可。
          var before = ink();
          if (!before) { window.l2dAlign = { err: '模型墨迹全透明' }; return; }
          // 保比例缩放 + 迭代收紧：墨迹 bbox 只能落整像素，一次缩放会留 ~1.4px 栅格化残差。
          for (var it = 0; it < 4; it++) {
            var mm = ink();
            if (!mm) return;
            var s = MASCOT_H / mm.h;
            if (Math.abs(s - 1) < 0.002) break;
            model.scale.set(model.scale.x * s);      // 保比例：x/y 同乘
            model.position.set(0, 0);
          }
          // 平移也迭代：右/下沿的像素取整同样会留半像素
          for (var jt = 0; jt < 2; jt++) {
            var mj = ink();
            if (!mj) return;
            model.position.x += (WIDTH - 1) - mj.x1;   // 墨迹右沿贴画布右缘（= 距视口右缘 MASCOT_RIGHT）
            model.position.y += (HEIGHT - 1) - mj.y1;  // 墨迹底沿贴画布底（= MASCOT_BOTTOM）
          }
          var fin = ink();
          window.l2dInk = fin ? { x: fin.x0, y: fin.y0, w: fin.w, h: fin.h,
                                  右空: (WIDTH - 1) - fin.x1, 下空: (HEIGHT - 1) - fin.y1 } : null;
          window.l2dAlign = {
            常量: { MASCOT_H: MASCOT_H, MASCOT_RIGHT: MASCOT_RIGHT, MASCOT_BOTTOM: MASCOT_BOTTOM },
            目标: { 高: MASCOT_H, 距视口右缘: MASCOT_RIGHT, 距视口底: MASCOT_BOTTOM },
            修前墨迹: before, 修后墨迹: fin,
            高差: fin ? +(fin.h - MASCOT_H).toFixed(2) : null,
            距右缘差: fin ? +(((WIDTH - 1) - fin.x1) - 0).toFixed(2) : null,
            距底差: fin ? +(((HEIGHT - 1) - fin.y1) - 0).toFixed(2) : null,
          };
          // 四项差值每页自报（宽那项拿兜底图的画当参照；宽差就是那个 0.79px 的长宽比差）。
          // 这段纯自报，要读兜底图才能算参照 —— 没配兜底图就没有参照，整段跳过（也别让
          // img.src 拿到空串去请求文档本身）。
          if (FALLBACK) (function () {
            var im = new Image();
            im.onload = function () {
              try {
                var cv = document.createElement('canvas');
                cv.width = im.naturalWidth; cv.height = im.naturalHeight;
                var g = cv.getContext('2d'); g.drawImage(im, 0, 0);
                var d = g.getImageData(0, 0, cv.width, cv.height).data;
                var x0 = cv.width, x1 = -1, y0 = cv.height, y1 = -1, x, y;
                for (y = 0; y < cv.height; y++) for (x = 0; x < cv.width; x++) {
                  if (d[(y * cv.width + x) * 4 + 3] > 8) {
                    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
                  }
                }
                var artW = x1 - x0 + 1, artH = y1 - y0 + 1;
                var tgtW = artW * (MASCOT_H / artH);       // 兜底画在目标高下的宽
                window.l2dAlign.兜底画 = { w: artW, h: artH, 目标宽: +tgtW.toFixed(2), 长宽比: +(artW / artH).toFixed(4) };
                window.l2dAlign.模型墨迹长宽比 = fin ? +(fin.w / fin.h).toFixed(4) : null;
                window.l2dAlign.宽差 = fin ? +(fin.w - tgtW).toFixed(2) : null;
                window.l2dAlign.长宽比差成因 = '兜底画与模型墨迹本来就是同一角色、长宽比略有差别；同高时宽差≈0.79px，如实留下，禁止拉伸抹平';
              } catch (e) { window.l2dAlign.兜底画 = { err: e.message }; }
            };
            im.src = FALLBACK;
          })();
        } catch (e) { window.l2dAlign = { err: e.name + ': ' + e.message }; }
      })();
      window.l2d = { app: app, model: model, WIDTH: WIDTH, HEIGHT: HEIGHT };
      // 模型自带的 Motions / Expressions 都没有（model3.json 里没这两个键，EyeBlink.Ids 也空），
      // 所以「不动」不是渲染坏了 —— 要动只能直接驱动参数（见下）。
      window.l2d.static = true;

      /* 驱动参数的唯一有效路径（实测过三条，只有这条生效）：
             cm._parameterValues[i] = v  →  cm.update()  →  app.render()
         · m.update(0) 不传播参数（闭眼实测 0 像素，cm.update() 是 3455 像素）；
         · cm.update() 只有第一次会动画面 —— 所以下面先预热 3 次越过它。 */
      var cm = model.internalModel.coreModel;
      function setParam(name, v) {
        var i = cm._parameterIds.indexOf(name);
        if (i < 0) return false;
        if (cm._parameterValues[i] === v) return false;   // 没变就不重画（鼠标不动 ⇒ 重画计数 0）
        cm._parameterValues[i] = v;
        cm.update();
        app.render();
        window.l2dRenders = (window.l2dRenders || 0) + 1;
        return true;
      }
      for (var w = 0; w < 3; w++) { cm.update(); app.render(); }   // 越过 cm.update() 的首次效应

      // 指针跟随：只驱动眼球（ParamEyeBallX/Y）—— 实测 ±1 就饱和，映射压在 [-1,1]。
      // 侧倾（ParamAngleZ / ParamBodyAngleZ，幅度 3465 / 9272 像素）与呼吸（ParamBreath）
      // 刻意不做，留作后续选项。
      // ★ 不按 prefers-reduced-motion 关：这是用户输入的直接反馈（跟手），不是自动播放的动画；
      //   跑马灯才是自动播放、所以在 reduce 下关掉。别把两者"统一"。
      var wantX = 0, wantY = 0, queued = false;
      function schedule() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(function () {
          queued = false;
          setParam('ParamEyeBallX', wantX);
          setParam('ParamEyeBallY', wantY);
        });
      }
      document.addEventListener('pointermove', function (e) {
        // 视口坐标 → [-1,1]：右为正 x、上为正 y（眼球的常规取向）
        wantX = Math.max(-1, Math.min(1, (e.clientX / window.innerWidth) * 2 - 1));
        wantY = Math.max(-1, Math.min(1, 1 - (e.clientY / window.innerHeight) * 2));
        schedule();
      }, { passive: true });

      // ParamV 不接任何事件（模型自带该参数，本站不用它）。

      // 问号 = ParamC，由搜索那边驱动（见 retro.js）：只在「真的无匹配」时置 1，错误态不出表情。
      window.l2dPose = {
        q: function (on) { setParam('ParamC', on ? 1 : 0); },
        eye: function (x, y) { wantX = Math.max(-1, Math.min(1, x)); wantY = Math.max(-1, Math.min(1, y)); schedule(); },
        set: setParam,
      };

      // 让模型真正静止的那一句（理由见上面 autoStart 那处）。
      if (window.PIXI && PIXI.Ticker && PIXI.Ticker.shared) PIXI.Ticker.shared.stop();
    })['catch'](function (e) {
      console.error('[看板娘] 模型加载失败：', e);
      fallback();
    });
  }
})();
