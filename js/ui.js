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
  /* v34 跨模块知识网：主题概念词典（关键词命中即归入该主题） */
  const REL_CONCEPTS = [
    ['高山', ['峰', '山脉', '高原', '山系', '喜马拉雅', '喀喇昆仑', '安第斯', '阿尔卑斯', '落基', '山']],
    ['火山', ['火山', '喷发', '岩浆', '地热', '温泉', '熔岩', '热点']],
    ['深海沟', ['海沟', '深海', '洋底', '海岭', '洋中脊', '海底']],
    ['洋流', ['洋流', '暖流', '寒流', '环流', '漂流', '上升流', '潮汐']],
    ['冰川', ['冰川', '冰盖', '冰架', '冰原', '冻土', '积雪', '雪线', '冰期']],
    ['极地', ['南极', '北极', '极地', '极夜', '极昼']],
    ['河流', ['河流', '大河', '三角洲', '流域', '江', '河']],
    ['湖泊', ['湖']],
    ['沙漠', ['沙漠', '沙丘', '荒漠', '干旱', '戈壁', '绿洲']],
    ['喀斯特', ['喀斯特', '岩溶', '溶洞', '天坑', '石林']],
    ['板块', ['板块', '俯冲', '碰撞', '裂谷', '断层', '地震', '漂移', '构造']],
    ['珊瑚', ['珊瑚', '礁']],
    ['岛屿', ['岛']],
    ['风系气候', ['季风', '信风', '西风', '风带', '气候', '降水', '雨影', '急流']],
    ['人类工程', ['城市', '人口', '农业', '运河', '大坝', '工程', '航运', '铁路']],
    ['生态', ['生物', '物种', '生态', '动物', '植物', '鲸', '企鹅', '鱼', '磷虾']],
    /* v35 扩充 10 类：跨模块知识网覆盖率 80% → 92% */
    ['古生物', ['恐龙', '三叶虫', '始祖鸟', '猛犸', '化石', '灭绝', '大爆发', '古生物', '翼龙', '菊石', '爬行']],
    ['瀑布', ['瀑布']],
    ['岩石地貌', ['玄武岩', '柱状节理', '暗色岩', '花岗岩', '丹霞', '风化', '侵蚀', '峡谷', '狭缝', '褶皱']],
    ['盐湖盐沼', ['盐沼', '盐湖', '咸水', '盐壳']],
    ['天气现象', ['台风', '飓风', '龙卷风', '气旋', '雷暴', '暴雨', '寒潮']],
    ['大气环境', ['臭氧', '大气', '磁场', '极光', '温室', '二氧化碳', '全球变暖', '变暖']],
    ['天文行星', ['行星', '自转', '公转', '月球', '陨石', '小行星', '太阳系', '天文', '引力', '银河']],
    ['土壤农业', ['黑土', '土壤', '耕地', '粮食', '牧场']],
    ['古文明遗迹', ['文明', '古城', '遗迹', '神庙', '商路', '帝国', '丝路', '考古', '遗址', '印加', '玛雅']],
    ['海洋环境', ['酸化', '死亡区', '缺氧', '污染', '海平面']],
  ];
  function BPRelConcepts(p) {
    const s = p.title + ' ' + (p.tags || []).join(' ');
    return REL_CONCEPTS.filter(([, kws]) => kws.some(k => s.includes(k))).map(([c]) => c);
  }

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
    /* v16 相关推荐 → v34 知识网络：同模块相邻 + 主题重合的跨模块关联 */
    const relBox = $('cardRelated');
    if (relBox) {
      const sibs = BP_POIS.filter(x => x.module === poi.module && x.id !== poi.id).slice(0, 3);
      /* 主题概念词典：关键词 → 概念（跨模块推荐用） */
      const mySet = new Set(BPRelConcepts(poi));
      const cross = BP_POIS
        .filter(x => x.module !== poi.module)
        .map(x => ({ x, n: BPRelConcepts(x).filter(c => mySet.has(c)).length }))
        .filter(o => o.n > 0)
        .sort((a, b) => b.n - a.n)
        .slice(0, 3)
        .map(o => o.x);
      let html = '';
      if (sibs.length) {
        html += '<div class="card-rel-title">📍 同模块</div>' + sibs.map(r =>
          `<button class="card-rel-link" data-poi="${r.id}">${r.title} →</button>`).join('');
      }
      if (cross.length) {
        html += '<div class="card-rel-title">🔗 跨模块知识网</div>' + cross.map(r => {
          const rm = BP_MODULES.find(m => m.id === r.module);
          return `<button class="card-rel-link" data-poi="${r.id}"><i class="rel-dot" style="background:${rm ? rm.color : '#8FC8E8'}"></i>${r.title} →</button>`;
        }).join('');
      }
      relBox.innerHTML = html;
      relBox.classList.toggle('hidden', !html);
      relBox.querySelectorAll('.card-rel-link').forEach(b => {
        b.addEventListener('click', () => {
          if (typeof BPPanels !== 'undefined' && BPPanels.selectApi) BPPanels.selectApi.selectPoi(b.dataset.poi);
        });
      });
    }
    /* v16 AI 配图（有 zhipu Key 时自动触发） */
    const aiBox = $('cardAiImg');
    if (aiBox) {
      aiBox.innerHTML = '';
      aiBox.classList.add('hidden');
      try {
        const llm = JSON.parse(localStorage.getItem('bp_llm_v1') || '{}');
        if (llm.key && llm.provider === 'zhipu') {
          aiBox.classList.remove('hidden');
          aiBox.innerHTML = '<div class="ai-loading">🖼 AI 配图生成中…</div>';
          fetch('https://open.bigmodel.cn/api/paas/v4/images/generations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + llm.key },
            body: JSON.stringify({ model: 'cogview-3-flash', prompt: poi.title + ' ' + (poi.tags || []).join(' '), size: '512x288' }),
          }).then(r => r.json()).then(j => {
            const url = j.data && j.data[0] && j.data[0].url;
            aiBox.innerHTML = url ? `<img class="ai-img" src="${url}" alt="AI 配图">` : '';
          }).catch(() => { aiBox.innerHTML = ''; });
        }
      } catch (e) { /* 静默 */ }
    }
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
    /* v25 朗读按钮：标题+摘要；再点停止；关卡片自动停 */
    const spBtn = $('cardSpeak');
    if (spBtn) {
      spBtn.classList.remove('on');
      spBtn.textContent = '🔊 朗读';
      spBtn.onclick = () => {
        if (typeof BPTTS === 'undefined') { spBtn.textContent = '🔇 不支持'; return; }
        if (spBtn.classList.contains('on')) {
          BPTTS.stop();
          spBtn.classList.remove('on');
          spBtn.textContent = '🔊 朗读';
          return;
        }
        const started = BPTTS.speak(`${poi.title}。${poi.summary}`, {
          onend: () => { spBtn.classList.remove('on'); spBtn.textContent = '🔊 朗读'; },
        });
        if (started) { spBtn.classList.add('on'); spBtn.textContent = '⏹ 停止'; }
        else spBtn.textContent = '🔇 不支持';
      };
    }
    /* v27 明信片：当前地球视图 + 知识点合成竖版 PNG */
    const pcBtn = $('cardPostcard');
    if (pcBtn) pcBtn.onclick = () => {
      if (typeof BPPostcard !== 'undefined') BPPostcard.make(poi);
    };
    /* v36 纪元百科条目：一键进入对应深时视角 */
    const epBtn = $('cardEpoch');
    if (epBtn) {
      const mEpoch = /^epoch-(\w+)$/.exec(poi.id);
      const epochOk = mEpoch && typeof BP_DEEPTIME !== 'undefined' &&
        BP_DEEPTIME.some(e => e.id === mEpoch[1]);
      epBtn.classList.toggle('hidden', !epochOk);
      epBtn.onclick = epochOk ? () => {
        if (typeof BPPanels !== 'undefined' && BPPanels.openEpochAt) BPPanels.openEpochAt(mEpoch[1]);
      } : null;
    }
    /* v24 收藏按钮 */
    const favBtn = $('cardFav');
    if (favBtn) {
      const on = typeof BPGame !== 'undefined' && BPGame.isFav && BPGame.isFav(poi.id);
      favBtn.textContent = on ? '⭐ 已收藏' : '☆ 收藏';
      favBtn.classList.toggle('on', on);
      favBtn.onclick = () => {
        if (typeof BPGame === 'undefined' || !BPGame.toggleFav) return;
        const now = BPGame.toggleFav(poi.id);
        favBtn.textContent = now ? '⭐ 已收藏' : '☆ 收藏';
        favBtn.classList.toggle('on', now);
        /* v25 球面金星角标同步 */
        if (typeof BPMarkers !== 'undefined' && BPMarkers.setFav) BPMarkers.setFav(poi.id, now);
      };
    }
    /* v20 分享按钮 */
    const share = $('cardShare');
    if (share) {
      share.classList.remove('hidden');
      share.textContent = '🔗 分享链接';
      share.onclick = async () => {
        const url = `${location.origin}${location.pathname}#poi=${poi.id}`;
        try {
          await navigator.clipboard.writeText(url);
          share.textContent = '✅ 已复制';
          setTimeout(() => { share.textContent = '🔗 分享链接'; }, 2000);
        } catch (e) {
          /* fallback */
          const ta = document.createElement('textarea');
          ta.value = url; document.body.appendChild(ta);
          ta.select(); document.execCommand('copy');
          document.body.removeChild(ta);
          share.textContent = '✅ 已复制';
          setTimeout(() => { share.textContent = '🔗 分享链接'; }, 2000);
        }
      };
    }
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
  let curFactText = '';   // v33 当前冷知识文本（📷 明信片用）
  function showFact() {
    const f = BP_FACTS[Math.floor(Math.random() * BP_FACTS.length)];
    const obj = typeof f === 'string' ? { t: f } : f;
    curFactText = obj.t;
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
    /* v33 冷知识明信片 */
    const fpc = $('factPc');
    if (fpc) fpc.addEventListener('click', () => {
      if (typeof BPPostcard !== 'undefined' && BPPostcard.makeFact) BPPostcard.makeFact(curFactText);
    });
    /* v33 移动端：冷知识紧凑条——点头部展开/收起正文（按钮不触发） */
    const fh2 = document.querySelector('#factCard .fact-head2');
    if (fh2) fh2.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      if (!window.matchMedia('(max-width: 860px)').matches) return;
      $('factCard').classList.toggle('open-m');
    });
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

    $('cardClose').addEventListener('click', () => {
      if (typeof BPTTS !== 'undefined') BPTTS.stop();
      if (cb.onCardClose) cb.onCardClose();
    });
    $('cardNext').addEventListener('click', () => { if (cb.onCardNext) cb.onCardNext(); });
    const pr = $('cardPrint');
    if (pr) pr.addEventListener('click', () => window.print());

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
