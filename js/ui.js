/* ============================================================
   BluePlanet UI 层（纯 DOM，不碰 WebGL）
   - 模块导航 / 图层开关 / 知识卡片
   - 实时时钟（北京时间 + UTC）与晨昏线快进
   - 冷知识轮播 / 地球 24 小时时间胶囊
   ============================================================ */

const BPUI = (() => {

  const $ = (id) => document.getElementById(id);
  const cb = {
    onModule: null,        // (moduleId|null) 点击模块导航
    onLayer: null,         // (layerKey, on) 图层开关
    onCardNext: null,      // () 同模块下一个
    onCardClose: null,     // ()
    onDay24: null,         // (event) 点击 24h 事件
  };

  /* ---------- 模块导航 ---------- */
  function buildModuleNav() {
    const ul = $('moduleList');
    const cnt = {};
    BP_POIS.forEach(p => { cnt[p.module] = (cnt[p.module] || 0) + 1; });
    ul.innerHTML = '';
    BP_MODULES.forEach(mod => {
      const li = document.createElement('li');
      li.dataset.module = mod.id;
      li.title = mod.desc;
      li.innerHTML =
        `<span class="mod-dot" style="background:${mod.color};color:${mod.color}"></span>` +
        `<span>${mod.name}</span>` +
        `<span class="mod-count">${cnt[mod.id] || 0}</span>`;
      li.addEventListener('click', () => {
        const active = li.classList.contains('active');
        ul.querySelectorAll('li').forEach(x => x.classList.remove('active'));
        if (!active) li.classList.add('active');
        if (cb.onModule) cb.onModule(active ? null : mod.id);
      });
      ul.appendChild(li);
    });
    /* 学习进度 + 折叠开关（v5.1 重叠修复） */
    const visited = (typeof BPGame !== 'undefined' && BPGame.profile) ? BPGame.profile.visited.length : 0;
    $('modProgress').textContent = `已点亮 ${visited}/${BP_POIS.length}`;
    $('modNavToggle').addEventListener('click', () => setNavCollapsed(!isNavCollapsed()));
    applyNavCollapsed();
  }
  function clearModuleActive() {
    $('moduleList').querySelectorAll('li').forEach(x => x.classList.remove('active'));
  }

  /* ---------- 面板折叠状态（v5.1，localStorage 持久化） ---------- */
  function uiState() {
    try { return JSON.parse(localStorage.getItem('bp_ui_v1') || '{}'); } catch (e) { return {}; }
  }
  function saveUiState(st) {
    try { localStorage.setItem('bp_ui_v1', JSON.stringify(st)); } catch (e) {}
  }
  function isNavCollapsed() { return !!uiState().navCollapsed; }
  function setNavCollapsed(v) {
    const st = uiState(); st.navCollapsed = !!v; saveUiState(st);
    applyNavCollapsed();
  }
  function applyNavCollapsed() {
    const v = isNavCollapsed();
    const nav = $('moduleNav');
    if (nav) nav.classList.toggle('collapsed', v);
    const b = $('modNavToggle');
    if (b) b.textContent = v ? '▸' : '▾';
  }
  function isFactCollapsed() { return !!uiState().factCollapsed; }
  function setFactCollapsed(v) {
    const st = uiState(); st.factCollapsed = !!v; saveUiState(st);
    applyFactCollapsed();
  }
  function applyFactCollapsed() {
    const v = isFactCollapsed();
    const card = $('factCard');
    if (card) card.classList.toggle('collapsed', v);
    document.body.classList.toggle('fact-collapsed', v);
    const b = $('factToggle');
    if (b) b.textContent = v ? '▸' : '▾';
  }

  /* ---------- 知识卡片（v5：图解 + 速览条 + 图片扩展位） ---------- */
  function fillCard(poi) {
    const mod = BP_MODULES.find(m => m.id === poi.module);
    $('cardModule').innerHTML =
      `<span class="dot" style="background:${mod.color}"></span>${mod.name}`;
    $('cardModule').style.color = mod.color;
    $('cardModule').style.borderColor = mod.color;
    $('cardStars').textContent = '★'.repeat(poi.difficulty) + '☆'.repeat(3 - poi.difficulty);
    $('cardTitle').textContent = poi.title;
    /* 图文并茂：真实图片位 > 类型化 SVG 图解 */
    const figBox = $('cardFig');
    if (figBox) {
      figBox.innerHTML = poi.img
        ? `<img class="card-img" src="${poi.img}" alt="${poi.title}">`
        : BPFigures.make(BPFigures.kindOf(poi), mod.color);
    }
    /* 数据速览条 */
    const statsBox = $('cardStats');
    if (statsBox) {
      const stats = (typeof BP_STATS !== 'undefined' && BP_STATS[poi.id]) || [];
      statsBox.innerHTML = stats.map(([k, v]) =>
        `<span class="stat-chip"><i>${k}</i><b>${v}</b></span>`).join('');
      statsBox.classList.toggle('hidden', !stats.length);
    }
    $('cardSummary').textContent = poi.summary;
    const box = $('cardContent');
    box.innerHTML = '';
    poi.content.forEach(par => {
      const p = document.createElement('p');
      p.textContent = par;
      box.appendChild(p);
    });
    $('cardTags').innerHTML = poi.tags.map(t => `<span># ${t}</span>`).join('');
    /* v9 相关冷知识：BP_FACTS 中关联本知识点的条目 */
    const factBox = $('cardFact');
    if (factBox) {
      const rel = (typeof BP_FACTS !== 'undefined') && BP_FACTS.find(f => typeof f === 'object' && f.poi === poi.id);
      factBox.classList.toggle('hidden', !rel);
      if (rel) factBox.textContent = '💡 ' + rel.t;
    }
    const latStr = `${Math.abs(poi.lat).toFixed(1)}°${poi.lat >= 0 ? 'N' : 'S'}`;
    const lonStr = `${Math.abs(poi.lon).toFixed(1)}°${poi.lon >= 0 ? 'E' : 'W'}`;
    $('cardCoord').textContent = `${latStr}, ${lonStr}`;
  }
  function openCard(poi) {
    fillCard(poi);
    $('poiCard').classList.add('open');
    $('poiCard').scrollTop = 0;
  }
  function closeCard() {
    $('poiCard').classList.remove('open');
  }

  /* ---------- 图层开关 ---------- */
  function bindLayers() {
    document.querySelectorAll('.layer-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        btn.setAttribute('aria-pressed', String(btn.classList.contains('active')));
        if (cb.onLayer) cb.onLayer(btn.dataset.layer, btn.classList.contains('active'));
      });
    });
  }

  /* ---------- 时钟 ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }

  function updateClock(date) {
    // 北京时间 = UTC+8
    const bj = new Date(date.getTime() + 8 * 3600 * 1000);
    $('clockBJ').textContent =
      `${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}:${pad(bj.getUTCSeconds())}`;
    $('clockUTC').textContent =
      `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  }

  /* ---------- 今日地球（v5：日期 + 地理日历 + 手动冷知识） ---------- */
  function showFact() {
    const f = BP_FACTS[Math.floor(Math.random() * BP_FACTS.length)];
    const obj = typeof f === 'string' ? { t: f } : f;
    const box = $('factBody');
    box.textContent = obj.t;
    box.querySelectorAll('.today-jump').forEach(b => b.remove());
    if (obj.poi) {
      const btn = document.createElement('button');
      btn.className = 'today-jump';
      btn.textContent = '📍 去相关知识点 →';
      btn.addEventListener('click', () => {
        if (typeof BPPanels !== 'undefined' && BPPanels.selectApi) BPPanels.selectApi.selectPoi(obj.poi);
      });
      box.appendChild(document.createElement('br'));
      box.appendChild(btn);
    }
  }

  function buildToday() {
    const now = new Date();
    const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()];
    $('todayDate').textContent = `${now.getMonth() + 1} 月 ${now.getDate()} 日 · ${week}`;
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hit = BP_CALENDAR.find(c => c.md === mm + '-' + dd);
    const ev = $('todayEvent');
    if (hit) {
      ev.innerHTML =
        `<div class="today-title">📌 ${hit.t}</div>` +
        `<div class="today-desc">${hit.d}</div>` +
        (hit.poi ? `<button class="today-jump" data-poi="${hit.poi}">📍 了解相关知识点 →</button>` : '');
    } else {
      ev.innerHTML = `<div class="today-title">📌 ${BP_MONTH_FOCUS[now.getMonth()]}</div>`;
    }
    ev.querySelectorAll('.today-jump').forEach(b => {
      b.addEventListener('click', () => {
        if (typeof BPPanels !== 'undefined' && BPPanels.selectApi) BPPanels.selectApi.selectPoi(b.dataset.poi);
      });
    });
    showFact();
    $('factNext').addEventListener('click', showFact);
    $('factToggle').addEventListener('click', () => setFactCollapsed(!isFactCollapsed()));
    applyFactCollapsed();
  }

  /* ---------- 地球 24 小时 ---------- */
  function buildDay24() {
    const track = $('day24Track');
    let prev = 0;
    BP_DAY24.segments.forEach(seg => {
      const w = seg.until - prev;
      prev = seg.until;
      const d = document.createElement('div');
      d.className = 'day24-seg';
      d.style.flex = `0 0 ${w}%`;
      d.style.background = `linear-gradient(180deg, ${seg.color}, ${seg.color}cc)`;
      d.title = seg.name;
      d.innerHTML = `<span class="seg-name">${seg.name}</span>`;
      d.addEventListener('click', () => {
        // 点击分段 → 弹出该段第一个事件（或首事件）
        const ev = BP_DAY24.events.find(e => e.p >= seg.until - w && e.p < seg.until)
          || BP_DAY24.events[0];
        showDay24Pop(ev);
      });
      track.appendChild(d);
    });
    BP_DAY24.events.forEach(ev => {
      const dot = document.createElement('div');
      dot.className = 'day24-ev';
      dot.style.left = ev.p + '%';
      dot.title = `${ev.t} ${ev.label}`;
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        showDay24Pop(ev);
      });
      track.appendChild(dot);
    });

    $('day24Toggle').addEventListener('click', () => {
      const body = $('day24Body');
      const collapsed = body.classList.toggle('hidden');
      $('day24Toggle').textContent = collapsed ? '展开' : '收起';
    });
  }

  function showDay24Pop(ev) {
    const pop = $('day24Pop');
    pop.innerHTML =
      `<div class="pop-time">${ev.t}</div>` +
      `<div class="pop-label">${ev.label}</div>` +
      `<div class="pop-desc">${ev.desc}</div>`;
    pop.classList.remove('hidden');
    // 限位：弹窗跟随事件点水平位置，但不超出容器
    const wrap = $('day24');
    const wrapW = wrap.clientWidth;
    const popW = Math.min(420, wrapW * 0.86);
    const left = (ev.p / 100) * (wrapW - 32) - popW / 2 + 16;
    pop.style.width = popW + 'px';
    pop.style.left = Math.max(4, Math.min(wrapW - popW - 4, left)) + 'px';
    clearTimeout(pop._t);
    pop._t = setTimeout(() => pop.classList.add('hidden'), 9000);
  }

  /* ---------- 悬停标签 ---------- */
  function showPoiLabel(poi, x, y) {
    const el = $('poiLabel');
    const mod = BP_MODULES.find(m => m.id === poi.module);
    el.innerHTML = `<span style="color:${mod.color}">●</span> ${poi.title}`;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.classList.remove('hidden');
  }
  function hidePoiLabel() { $('poiLabel').classList.add('hidden'); }

  /* ---------- 提示与加载 ---------- */
  function fadeHint() { $('hint').classList.add('fade'); }
  function hideLoading() {
    const el = $('loading');
    el.classList.add('fade-out');
    setTimeout(() => el.remove(), 900);
  }
  function showLoadingError(msg) {
    const el = $('loading');
    el.classList.add('error');
    el.querySelector('.loading-sub').textContent = msg;
  }

  /* ---------- 初始化 ---------- */
  function init() {
    buildModuleNav();
    bindLayers();
    buildDay24();
    buildToday();

    $('cardClose').addEventListener('click', () => { if (cb.onCardClose) cb.onCardClose(); });
    $('cardNext').addEventListener('click', () => { if (cb.onCardNext) cb.onCardNext(); });

    // 首次交互后淡出提示
    const dismiss = () => { fadeHint(); window.removeEventListener('pointerdown', dismiss); };
    window.addEventListener('pointerdown', dismiss);
    setTimeout(fadeHint, 9000);
  }

  return {
    init, cb, openCard, closeCard, clearModuleActive, updateClock,
    showPoiLabel, hidePoiLabel, hideLoading, showLoadingError,
    isNavCollapsed, setNavCollapsed, applyNavCollapsed,
  };
})();
