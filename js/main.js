/* ============================================================
   BluePlanet 主程序：装配各层 + 渲染循环
   - rAF 暂停体系：页面隐藏即停（省电，IAB 友好）
   - 自适应降质：帧时间超标时逐级降低 pixelRatio
   - 交互：悬停标签 / 点击选中（区分拖拽）/ 快捷键 Esc
   ============================================================ */

(() => {

  let rafId = 0;
  let lastT = 0;
  let running = false;

  /* ---------- 自适应画质 ---------- */
  const quality = {
    steps: [Math.min(window.devicePixelRatio || 1, 1.75), 1.25, 1],
    idx: 0,
    emaFrameMs: 16,
    cooldown: 0,
    tick(dtMs) {
      this.emaFrameMs = this.emaFrameMs * 0.95 + dtMs * 0.05;
      this.cooldown -= dtMs;
      // 持续掉帧（>38ms）且冷却结束后降一档
      if (this.emaFrameMs > 38 && this.cooldown <= 0 && this.idx < this.steps.length - 1) {
        this.idx++;
        BPScene.setPixelRatio(this.steps[this.idx]);
        this.cooldown = 4000;
        console.warn(`[BluePlanet] 帧率不足，已降级渲染像素比 → ${this.steps[this.idx]}`);
      }
    },
  };

  /* ---------- 兴趣点选择 ---------- */
  function selectPoi(id) {
    const poi = BP_POIS.find(p => p.id === id);
    if (!poi) return;
    BPMarkers.setSelected(id);
    BPScene.spin.pausedByCard = true;   // 打开卡片期间暂停自转，便于阅读
    BPUI.openCard(poi);
    BPScene.flyTo(poi.lat, poi.lon, 252, 1500);
    // 打卡 + 徽章解锁提示 + 金环可视化
    const fresh = BPGame.markVisited(id);
    BPMarkers.setVisited(id);
    fresh.forEach(b => {
      const def = BPGame.badges.find(x => x.id === b);
      if (def) BPPanels.toast(`🏅 解锁徽章：${def.icon} ${def.t}`);
    });
  }

  function deselectPoi() {
    BPMarkers.setSelected(null);
    BPScene.spin.pausedByCard = false;
    BPUI.closeCard();
  }

  function nextPoiInModule() {
    const cur = BPMarkers.getSelected();
    if (!cur) return;
    const poi = BP_POIS.find(p => p.id === cur);
    const list = BP_POIS.filter(p => p.module === poi.module);
    const i = list.findIndex(p => p.id === cur);
    selectPoi(list[(i + 1) % list.length].id);
  }

  /* ---------- 指针交互 ---------- */
  let down = null;
  let dragging = false;

  function bindPointer(canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
      dragging = false;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (down) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (dx * dx + dy * dy > 36) dragging = true;   // 位移>6px 视为拖拽
      }
      if (dragging || BPScene.isFlying()) { BPUI.hidePoiLabel(); BPMarkers.setHovered(null); return; }
      // 悬停拾取（每次移动直接算，39 个球开销可忽略）
      const id = BPMarkers.raycastAt(e.clientX, e.clientY);
      BPMarkers.setHovered(id);
      canvas.style.cursor = id ? 'pointer' : 'grab';
      if (id) {
        const poi = BP_POIS.find(p => p.id === id);
        const scr = BPMarkers.getScreenXY(id);
        if (scr && scr.front) BPUI.showPoiLabel(poi, scr.x, scr.y);
        else BPUI.hidePoiLabel();
      } else {
        BPUI.hidePoiLabel();
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      const wasDown = down;
      down = null;
      if (!wasDown || dragging) return;
      if (performance.now() - wasDown.t > 450) return;   // 长按不算点击
      if (typeof BPRandom !== 'undefined') BPRandom.stop();   // 手动点击即接管，停止漫游
      const id = BPMarkers.raycastAt(e.clientX, e.clientY);
      if (id) selectPoi(id);
      else if (BPMarkers.getSelected()) deselectPoi();   // 点空处收起卡片
    });
    canvas.addEventListener('pointerleave', () => {
      BPUI.hidePoiLabel();
      BPMarkers.setHovered(null);
    });

    // 用户拖拽/缩放时记录交互时间（自转让位）
    BPScene.controls.addEventListener('start', () => {
      BPScene.spin.lastUserTouch = performance.now() / 1000;
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') deselectPoi();
    });

    /* v3 键盘快捷键：/ 搜索，1-8 模块导航，+/- 缩放（输入框聚焦时不响应） */
    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (document.querySelector('.modal:not(.hidden)')) return;
      if (e.key === '/') {
        e.preventDefault();
        const si = document.getElementById('searchInput');
        if (si) si.focus();
      } else if (e.key === 'r' || e.key === 'R') {
        if (typeof BPRandom !== 'undefined') {
          BPRandom.stop();          // 手动接管即停漫游
          BPRandom.go();
        }
      } else if (e.key === 'Escape') {
        if (typeof BPRandom !== 'undefined') BPRandom.stop();
        deselectPoi();
      } else if (/^[1-9]$/.test(e.key)) {
        const li = document.querySelectorAll('#moduleList li')[+e.key - 1];
        if (li) li.click();
      } else if (e.key === '+' || e.key === '=') {
        zoomBy(0.82);
      } else if (e.key === '-' || e.key === '_') {
        zoomBy(1.22);
      }
    });
  }

  function zoomBy(f) {
    const c = BPScene.camera;
    const d = Math.max(BPScene.controls.minDistance,
      Math.min(BPScene.controls.maxDistance, c.position.length() * f));
    c.position.setLength(d);
  }

  /* ---------- UI 回调 ---------- */
  function bindUI() {
    BPUI.cb.onModule = (moduleId) => {
      BPMarkers.setModuleFilter(moduleId);
      if (moduleId) {
        const mod = BP_MODULES.find(m => m.id === moduleId);
        BPScene.flyTo(mod.cam.lat, mod.cam.lon, mod.cam.dist, 1600);
        // 飞行途中顺便收起卡片，聚焦模块浏览
        if (BPMarkers.getSelected()) deselectPoi();
      }
    };
    BPUI.cb.onLayer = (key, on) => {
      if (key === 'plates') BPScene.plateGroup.visible = on;
      if (key === 'clouds') BPScene.cloudMesh.visible = on;
      if (key === 'markers') BPMarkers.setVisible(on);
      if (key === 'labels') BPLabels.setVisible(on);
      if (key === 'rivers' || key === 'currents' || key === 'winds' || key === 'climate') {
        BPLayers.setVisible(key, on);
      }
      if (key === 'spin') BPScene.spin.auto = on;
    };
    BPUI.cb.onCardNext = nextPoiInModule;
    BPUI.cb.onCardClose = deselectPoi;
    BPUI.cb.onDay24 = () => {};
  }

  /* ---------- 渲染循环（含暂停体系） ---------- */
  let clockAcc = 0;
  let lastW = window.innerWidth, lastH = window.innerHeight;

  function loop(t) {
    rafId = requestAnimationFrame(loop);
    // 视口尺寸自检兜底（部分内嵌 WebView 不派发 resize 事件）
    if (window.innerWidth !== lastW || window.innerHeight !== lastH) {
      lastW = Math.max(1, window.innerWidth || 1);
      lastH = Math.max(1, window.innerHeight || 1);
      BPScene.resize();
    }
    const dtMs = Math.min(t - lastT, 100);   // 钳制，切后台回来不跳变
    lastT = t;
    const dtSec = dtMs / 1000;
    const nowSec = t / 1000;

    quality.tick(dtMs);
    BPScene.update(dtSec, dtMs, nowSec);
    BPMarkers.animate(nowSec);
    BPLabels.update();
    BPLayers.update(dtSec);
    BPCutaway.update(dtSec);

    // 选中标记的标签跟随投影（悬停标签由 pointermove 驱动，优先级更高）
    const selId = BPMarkers.getSelected();
    if (selId && !BPMarkers.getHovered()) {
      const scr = BPMarkers.getScreenXY(selId);
      if (scr && scr.front) {
        const poi = BP_POIS.find(p => p.id === selId);
        BPUI.showPoiLabel(poi, scr.x, scr.y);
      } else BPUI.hidePoiLabel();
    }

    // 时钟 4 次/秒刷新足够
    clockAcc += dtMs;
    if (clockAcc > 250) {
      clockAcc = 0;
      BPUI.updateClock(new Date());
    }

    BPScene.render();
  }

  function start() {
    if (running) return;
    running = true;
    lastT = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  window.addEventListener('resize', () => BPScene.resize());

  /* ---------- 启动 ---------- */
  function boot() {
    const canvas = document.getElementById('scene');
    BPGame.load();          // 先载档案：标记的金环需要已访问列表
    BPUI.init();
    bindUI();
    registerSW();

    BPTextures.load()
      .then(tex => {
        BPScene.init(canvas, tex);
        BPMarkers.build(tex);
        BPLabels.build();
        BPLayers.build(tex);
        BPPanels.init({
          selectPoi,
          deselectPoi,
        });
        bindPointer(canvas);
        BPUI.hideLoading();
        start();
        // 入场动画：从远处推近至东亚上空
        BPScene.flyTo(24, 105, 345, 2600);
      })
      .catch(err => {
        console.error('[BluePlanet] 初始化失败：', err);
        BPUI.showLoadingError('初始化失败：' + (err.message || 'WebGL 不可用') + '，请用新版 Chrome/Edge 打开');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* v3 PWA：http(s) 环境注册 Service Worker（file:// 下静默跳过） */
  function registerSW() {
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  /* 全局错误兜底：渲染循环异常不至于静默黑屏 */
  window.addEventListener('error', (e) => {
    if (e.message && e.message.indexOf('ResizeObserver') >= 0) return;
    try { BPUI.showLoadingError('运行出错：' + String(e.message).slice(0, 60)); } catch (err) {}
  });

})();
