/* ============================================================
   BluePlanet 专题面板（M3~M6 UI 接线）
   - 专题工具条：剖析 / 巡礼 / 闯关 / 看板 / 徽章
   - 剖析面板：剥层滑块 + 圈层图例 + 地震波开关
   - 巡礼：菜单选择 + 站点进度条
   - 闯关 / 看板 / 徽章：居中模态框
   - 每日地球：今日推荐芯片；徽章解锁 toast
   ============================================================ */

const BPPanels = (() => {

  const $ = (id) => document.getElementById(id);
  const api = { selectPoi: null, deselectPoi: null };
  let labelsLayerOn = true;

  /* ---------- toast ---------- */
  function toast(msg, ms = 3200) {
    let box = $('bpToast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'bpToast';
      document.body.appendChild(box);
    }
    box.textContent = msg;
    box.classList.add('show');
    clearTimeout(box._t);
    box._t = setTimeout(() => box.classList.remove('show'), ms);
  }

  /* ---------- 初始化 ---------- */
  function init(mainApi) {
    Object.assign(api, mainApi);
    buildCutLegend();
    buildTourMenu();
    wireToolbar();
    wireCut();
    wireTour();
    wireModals();
    /* v3：搜索 / 小助手 / 实验室 */
    BPSearch.init((poiId) => api.selectPoi(poiId));
    BPAssistant.wire();
    BPLab.wire();
    /* v4：随机探索 */
    buildRandomMenu();
    $('btnRandom').addEventListener('click', () => {
      $('randomMenu').classList.toggle('hidden');
    });
    BPRandom.onSelect = (poiId) => api.selectPoi(poiId);
    BPRandom.onUI = renderRandomMenu;
    BPRandom.onToast = toast;
    /* v6 深时古地球 */
    buildDeeptime();
    $('btnDeeptime').addEventListener('click', toggleDeeptime);
    $('dtExit').addEventListener('click', toggleDeeptime);
    BPDeepTime.onEpoch = (epoch) => renderDtInfo(epoch);
    /* v7 大陆拼图 */
    $('btnPuzzle').addEventListener('click', () => BPPuzzle.open());
    $('puzzleClose').addEventListener('click', () => BPPuzzle.close());
    $('puzzleRestart').addEventListener('click', () => BPPuzzle.restart());
    document.querySelectorAll('#puzzleModal .lab-tab').forEach(b => {
      b.addEventListener('click', () => {
        BPPuzzle.setDifficulty(b.dataset.pd);
        document.querySelectorAll('#puzzleModal .lab-tab').forEach(x => x.classList.toggle('on', x === b));
      });
    });
    /* 巡礼站点选中 → 主程序选点 */
    BPTours.onSelect = (poiId) => { if (poiId) api.selectPoi(poiId); };
    BPTours.onUI = renderTourBar;
    /* 剖切圈层选中 → 圈层知识卡 */
    BPCutaway.onSelect = (i) => showCutInfo(i);
    BPGame.load();
    renderDaily();
    /* 图层初始可见性与按钮状态同步（无 active 类的默认关闭） */
    document.querySelectorAll('.layer-btn').forEach(btn => {
      const key = btn.dataset.layer;
      const on = btn.classList.contains('active');
      if (key === 'rivers' || key === 'currents' || key === 'winds' || key === 'climate') {
        BPLayers.setVisible(key, on);
      }
    });
  }

  /* ---------- 工具条 ---------- */
  function wireToolbar() {
    $('btnCutaway').addEventListener('click', toggleCutaway);
    $('btnTours').addEventListener('click', () => {
      const menu = $('tourMenu');
      menu.classList.toggle('hidden');
    });
    $('btnQuiz').addEventListener('click', () => { openQuiz(); });
    $('btnInsights').addEventListener('click', openInsights);
    $('btnBadges').addEventListener('click', openBadges);
  }

  /* ---------- 剖析模式 ---------- */
  function toggleCutaway() {
    if (!BPCutaway.isActive) {
      labelsLayerOn = !$('labelLayer').classList.contains('bp-off');
      BPCutaway.enter();
      $('cutPanel').classList.remove('hidden');
      BPUI.hidePoiLabel();
      BPLabels.setVisible(false);
      if (api.deselectPoi) api.deselectPoi();
      $('btnCutaway').classList.add('on');
      toast('🌗 已进入地球剖析：拖动滑块剥层，点击圈层看知识');
    } else {
      BPCutaway.exit();
      $('cutPanel').classList.add('hidden');
      $('cutInfo').classList.add('hidden');
      BPLabels.setVisible(labelsLayerOn);
      $('btnCutaway').classList.remove('on');
    }
  }

  function buildCutLegend() {
    const box = $('cutLegend');
    box.innerHTML = '';
    BP_EARTH_LAYERS.forEach((L, i) => {
      const chip = document.createElement('button');
      chip.className = 'cut-chip';
      chip.innerHTML = `<span class="dot" style="background:${L.color}"></span>${L.t}`;
      chip.addEventListener('click', () => showCutInfo(i));
      box.appendChild(chip);
    });
  }

  function showCutInfo(i) {
    const box = $('cutInfo');
    if (i < 0 || i >= BP_EARTH_LAYERS.length) { box.classList.add('hidden'); return; }
    const L = BP_EARTH_LAYERS[i];
    box.innerHTML =
      `<div class="cut-info-title"><span class="dot" style="background:${L.color}"></span>${L.t}</div>` +
      `<div class="cut-info-row">范围：${L.depth}</div>` +
      `<div class="cut-info-row">温度：${L.temp}</div>` +
      `<div class="cut-info-row">物态：${L.state}</div>` +
      `<div class="cut-info-desc">${L.desc}</div>`;
    box.classList.remove('hidden');
    document.querySelectorAll('.cut-chip').forEach((c, ci) => c.classList.toggle('on', ci === i));
  }

  function wireCut() {
    $('cutSlider').addEventListener('input', (e) => BPCutaway.setExplode(e.target.value / 100));
    $('cutExit').addEventListener('click', toggleCutaway);
    $('cutWaves').addEventListener('click', () => {
      const on = !$('cutWaves').classList.contains('off');
      $('cutWaves').classList.toggle('off', on);
      BPCutaway.setWaves(!on);
    });
  }

  /* ---------- 巡礼 ---------- */
  function buildTourMenu() {
    const menu = $('tourMenu');
    BP_TOURS.forEach(t => {
      const b = document.createElement('button');
      b.className = 'tour-item';
      b.innerHTML = `<span class="tour-ico">${t.icon}</span><span><b>${t.t}</b><i>${t.desc}</i></span>`;
      b.addEventListener('click', () => {
        BPTours.start(t.id);
        menu.classList.add('hidden');
      });
      menu.appendChild(b);
    });
    const div = document.createElement('div');
    div.className = 'tour-menu-sep';
    div.textContent = '极点俯视';
    menu.appendChild(div);
    [['北极 ❄️', 'north'], ['南极 🐧', 'south']].forEach(([txt, which]) => {
      const b = document.createElement('button');
      b.className = 'tour-item small';
      b.innerHTML = `<span class="tour-ico">${txt.split(' ')[1]}</span><span><b>${txt.split(' ')[0]}俯视</b><i>相机飞到极点上方看冰与海</i></span>`;
      b.addEventListener('click', () => {
        BPTours[which]();
        menu.classList.add('hidden');
      });
      menu.appendChild(b);
    });
  }

  function renderTourBar() {
    const st = BPTours.state;
    const bar = $('tourBar');
    if (!st) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    $('tourTitle').textContent = `${st.tour.icon} ${st.tour.t}`;
    const dots = st.tour.stops.map((_, i) =>
      `<span class="tour-dot${i === st.idx ? ' on' : (i < st.idx ? ' past' : '')}"></span>`).join('');
    $('tourProg').innerHTML = dots + `<span class="tour-n">${st.idx + 1}/${st.tour.stops.length}</span>`;
  }

  function wireTour() {
    $('tourPrev').addEventListener('click', () => BPTours.prev());
    $('tourNext').addEventListener('click', () => BPTours.next());
    $('tourExit').addEventListener('click', () => { BPTours.stop(); if (api.deselectPoi) api.deselectPoi(); });
  }

  /* ---------- 知识闯关 ---------- */
  function openQuiz() {
    BPGame.startQuiz();
    $('quizModal').classList.remove('hidden');
    renderQuiz();
  }
  function renderQuiz() {
    const q = BPGame.quizState;
    const box = $('quizBody');
    if (!q) { box.innerHTML = ''; return; }
    box.innerHTML =
      `<div class="quiz-progress">第 ${q.idx + 1} / ${q.qs.length} 题 · 答对 ${q.score}</div>` +
      `<div class="quiz-q">${q.qs[q.idx].q}</div>` +
      `<div class="quiz-opts">${q.qs[q.idx].a.map((a, i) =>
        `<button class="quiz-opt" data-i="${i}">${String.fromCharCode(65 + i)}. ${a}</button>`).join('')}</div>` +
      `<div class="quiz-explain hidden"></div>` +
      `<div class="quiz-actions"><button class="chip-btn hidden" id="quizNext">下一题 →</button></div>`;
    box.querySelectorAll('.quiz-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = BPGame.answerQuiz(+btn.dataset.i);
        if (!r) return;
        box.querySelectorAll('.quiz-opt').forEach((b, i) => {
          b.disabled = true;
          if (i === q.qs[q.idx].c) b.classList.add('correct');
          else if (+b.dataset.i === +btn.dataset.i && !r.ok) b.classList.add('wrong');
        });
        const ex = box.querySelector('.quiz-explain');
        ex.textContent = (r.ok ? '✅ 答对了！' : '❌ 正确答案是 ' + String.fromCharCode(65 + r.correct) + '。') + ' ' + q.qs[q.idx].e;
        ex.classList.remove('hidden');
        const nb = box.querySelector('#quizNext');
        nb.classList.remove('hidden');
        nb.textContent = q.idx === q.qs.length - 1 ? '查看成绩 →' : '下一题 →';
        nb.addEventListener('click', () => {
          const res = BPGame.nextQuiz();
          if (res && res.done) renderQuizResult(res);
          else renderQuiz();
        });
      });
    });
  }
  function renderQuizResult(res) {
    const box = $('quizBody');
    box.innerHTML =
      `<div class="quiz-result">
        <div class="quiz-score">${res.score}<i>/${res.total}</i></div>
        <div class="quiz-verdict">${res.score === res.total ? '🏆 满分！地理学家就是你了' :
          res.score >= 6 ? '🎉 不错的基础，继续探索！' : '📖 多点点光柱再来挑战！'}</div>
        <div class="quiz-best">历史最佳：${BPGame.profile.quizBest} 分</div>
        <div class="quiz-actions">
          <button class="chip-btn" id="quizAgain">再来一轮</button>
          <button class="chip-btn warn" id="quizClose2">关闭</button>
        </div>
      </div>`;
    $('quizAgain').addEventListener('click', openQuiz);
    $('quizClose2').addEventListener('click', closeModal);
    res.fresh.forEach(b => {
      const def = BPGame.badges.find(x => x.id === b);
      if (def) toast(`🏅 解锁徽章：${def.icon} ${def.t}`);
    });
  }

  /* ---------- 模态框 ---------- */
  function closeModal() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    if (typeof BPPuzzle !== 'undefined' && BPPuzzle.isOpen) BPPuzzle.close();
  }
  function wireModals() {
    $('quizClose').addEventListener('click', closeModal);
    $('insClose').addEventListener('click', closeModal);
    $('badgeClose').addEventListener('click', closeModal);
    document.querySelectorAll('.modal').forEach(m => {
      m.addEventListener('click', (e) => { if (e.target === m) closeModal(); });
    });
  }

  function openInsights() {
    $('insModal').classList.remove('hidden');
    BPInsights.render($('insBody'));
  }

  function openBadges() {
    const p = BPGame.profile;
    $('badgeBody').innerHTML =
      `<div class="badge-progress">已点亮 <b>${p.visited.length}</b> / ${BP_POIS.length} 个知识点 · 徽章 <b>${p.badges.length}</b> / ${BPGame.badges.length}</div>` +
      `<div class="badge-grid">${BPGame.badges.map(b => {
        const got = p.badges.includes(b.id);
        return `<div class="badge-cell${got ? ' got' : ''}">
          <div class="badge-ico">${got ? b.icon : '🔒'}</div>
          <div class="badge-t">${b.t}</div>
          <div class="badge-d">${b.d}</div>
        </div>`;
      }).join('')}</div>`;
    $('badgeModal').classList.remove('hidden');
  }

  /* ---------- 随机探索（v4） ---------- */
  const RANDOM_MODES = [
    { m: 'all', icon: '🎲', t: '全部随机', d: '在所有知识点中抽取' },
    { m: 'module', icon: '📂', t: '当前模块内随机', d: '只抽左侧高亮模块的知识点' },
    { m: 'unvisited', icon: '✨', t: '未打卡优先', d: '八成概率抽没去过的知识' },
  ];
  function buildRandomMenu() {
    const menu = $('randomMenu');
    RANDOM_MODES.forEach(({ m, icon, t, d }) => {
      const b = document.createElement('button');
      b.className = 'tour-item small random-mode';
      b.dataset.mode = m;
      b.innerHTML = `<span class="tour-ico">${icon}</span><span><b>${t}</b><i>${d}</i></span>`;
      b.addEventListener('click', () => {
        BPRandom.setMode(m);
        $('randomMenu').classList.add('hidden');
        BPRandom.go();
      });
      menu.appendChild(b);
    });
    const wanderBtn = document.createElement('button');
    wanderBtn.className = 'tour-item small';
    wanderBtn.id = 'randomWanderBtn';
    wanderBtn.innerHTML = `<span class="tour-ico">🌀</span><span><b>随机漫游</b><i>每 12 秒自动飞达一站</i></span>`;
    wanderBtn.addEventListener('click', () => {
      BPRandom.toggleWander();
      $('randomMenu').classList.add('hidden');
    });
    menu.appendChild(wanderBtn);
  }
  function renderRandomMenu() {
    document.querySelectorAll('.random-mode').forEach(b => {
      b.classList.toggle('on', BPRandom.mode === b.dataset.mode);
    });
    const wb = $('randomWanderBtn');
    if (wb) wb.querySelector('b').textContent = BPRandom.isWandering ? '⏹ 停止漫游' : '🌀 随机漫游';
    $('btnRandom').classList.toggle('on', BPRandom.isWandering);
  }

  /* ---------- 深时古地球（v6） ---------- */
  function buildDeeptime() {
    const box = $('dtEpochs');
    box.innerHTML = '';
    for (const id of BP_DEEPTIME_ORDER) {
      const e = BP_DEEPTIME.find(x => x.id === id);
      const b = document.createElement('button');
      b.className = 'dt-epoch-btn';
      b.innerHTML = `<span class="dot" style="background:${e.color}"></span>${e.t}<i>${e.ma ? e.ma + ' Ma' : '今'}</i>`;
      b.addEventListener('click', () => {
        if (!BPDeepTime.isActive) enterDt();
        BPDeepTime.setEpoch(id);
        document.querySelectorAll('.dt-epoch-btn').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
      });
      box.appendChild(b);
    }
  }
  function enterDt() {
    BPDeepTime.enter('present');
    BPUI.hidePoiLabel();
    if (api.deselectPoi) api.deselectPoi();
    $('dtPanel').classList.remove('hidden');
    $('btnDeeptime').classList.add('on');
    toast('🦕 深时地球：点上方纪元按钮，回看 5 亿年大陆漂移');
  }
  function toggleDeeptime() {
    if (!BPDeepTime.isActive) enterDt();
    else {
      BPDeepTime.exit();
      $('dtPanel').classList.add('hidden');
      $('btnDeeptime').classList.remove('on');
    }
  }
  function renderDtInfo(epoch) {
    const box = $('dtInfo');
    const poiId = 'epoch-' + epoch.id;
    const hasPoi = typeof BP_POIS !== 'undefined' && BP_POIS.some(p => p.id === poiId);
    box.innerHTML =
      `<div class="cut-info-title"><span class="dot" style="background:${epoch.color}"></span>${epoch.t}${epoch.ma ? `（${epoch.ma} 百万年前）` : ''}</div>` +
      `<div class="cut-info-row">${epoch.brief}</div>` +
      `<div class="dt-facts">` +
      `<span>大气氧 <b>${epoch.oxygen}</b></span><span>CO₂ <b>${epoch.co2}</b></span><span>海平面 <b>${epoch.sea}</b></span>` +
      `</div>` +
      `<div class="cut-info-desc">${epoch.life}</div>` +
      (hasPoi ? `<button class="today-jump" id="dtJump">📍 看这个时代的百科条目 →</button>` : '');
    box.classList.remove('hidden');
    const jb = $('dtJump');
    if (jb) jb.addEventListener('click', () => {
      toggleDeeptime();                      // 先退出深时回现代地球
      if (api.selectPoi) api.selectPoi(poiId);
    });
  }

  /* ---------- 每日地球 ---------- */
  function renderDaily() {
    const poi = BPGame.dailyPoi();
    $('factDaily').innerHTML =
      `<span class="daily-label">📍 今日推荐</span>` +
      `<button class="daily-go" id="dailyGo">${poi.title} →</button>`;
    $('dailyGo').addEventListener('click', () => api.selectPoi(poi.id));
  }

  return {
    init, toast, closeModal, openBadges, openQuiz, openInsights,
    get selectApi() { return api; },
  };
})();
