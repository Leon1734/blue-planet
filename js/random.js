/* ============================================================
   BluePlanet 随机探索（v4）
   - go()：一键随机飞达一个知识点（复用 selectPoi 全链路）
   - 三种范围：all 全部 / module 当前模块过滤内 / unvisited 未打卡优先
   - 防重复：最近 5 站历史栈，抽中自动重掷
   - wander()：随机漫游模式，12 秒一站自动播报
   - 档案联动：randomVisited / randomCount → 探险家 / 随机大师徽章
   ============================================================ */

const BPRandom = (() => {

  const cb = { onSelect: null, onUI: null, onToast: null };
  const RECENT_MAX = 5;
  const WANDER_MS = 12000;
  const recent = [];            // 最近抽中的 poiId 栈
  let mode = 'all';             // all | module | unvisited
  let wandering = false;
  let timer = null;
  let wanderNo = 0;

  function toast(msg) { if (cb.onToast) cb.onToast(msg); }

  /* ---------- 抽取池 ---------- */
  function pool() {
    let list = BP_POIS;
    if (mode === 'module') {
      const f = BPMarkers.getModuleFilter();
      if (f) list = list.filter(p => p.module === f);
    }
    if (mode === 'unvisited') {
      const visited = (typeof BPGame !== 'undefined' && BPGame.profile)
        ? BPGame.profile.visited : [];
      const fresh = list.filter(p => !visited.includes(p.id));
      // 80% 概率从未访问池抽，20% 全池（保留温故机会）
      if (fresh.length && Math.random() < 0.8) return fresh;
    }
    return list;
  }

  /* ---------- 档案与徽章 ---------- */
  function record(poiId) {
    if (typeof BPGame === 'undefined' || !BPGame.profile) return;
    const prof = BPGame.profile;
    prof.randomCount = (prof.randomCount || 0) + 1;
    if (!prof.randomVisited) prof.randomVisited = [];
    const distinct = prof.randomVisited.includes(poiId)
      ? prof.randomVisited.length
      : prof.randomVisited.length + 1;
    if (!prof.randomVisited.includes(poiId)) prof.randomVisited.push(poiId);
    const fresh = BPGame.markRandom(distinct, prof.randomCount);
    fresh.forEach(b => {
      const def = BPGame.badges.find(x => x.id === b);
      if (def) toast(`🏅 解锁徽章：${def.icon} ${def.t}`);
    });
  }

  /* ---------- 抽取 ---------- */
  function pick() {
    let list = pool().filter(p => !recent.includes(p.id));
    if (!list.length) list = pool();               // 池太小则放开防重复
    if (!list.length) return null;
    const poi = list[Math.floor(Math.random() * list.length)];
    recent.push(poi.id);
    if (recent.length > RECENT_MAX) recent.shift();
    return poi;
  }

  /* ---------- 单次随机 ---------- */
  function go() {
    if (typeof BPCutaway !== 'undefined' && BPCutaway.isActive) {
      toast('🌗 剖析模式中，先退出再随机探索');
      return null;
    }
    if (typeof BPTours !== 'undefined' && BPTours.running) BPTours.stop();
    const poi = pick();
    if (!poi) { toast('🎲 这个范围内没有知识点'); return null; }
    record(poi.id);
    if (cb.onSelect) cb.onSelect(poi.id);
    if (wandering) toast(`🎲 随机漫游 · 第 ${wanderNo} 站：${poi.title}`);
    else toast(`🎲 随机到达：${poi.title}`);
    if (cb.onUI) cb.onUI();
    return poi;
  }

  /* ---------- 随机漫游 ---------- */
  function wander(on) {
    clearTimeout(timer);
    wandering = !!on;
    if (wandering) {
      wanderNo = 0;
      if (cb.onUI) cb.onUI();
      const step = () => {
        wanderNo++;
        go();
        timer = setTimeout(step, WANDER_MS);
      };
      step();
    } else {
      if (cb.onUI) cb.onUI();
    }
  }
  function toggleWander() {
    wander(!wandering);
    return wandering;
  }
  function stop() { if (wandering) wander(false); }

  function setMode(m) {
    mode = m;
    if (cb.onUI) cb.onUI();
  }

  return {
    go, wander, toggleWander, stop, setMode,
    get mode() { return mode; },
    get isWandering() { return wandering; },
    get wanderNo() { return wanderNo; },
    set onSelect(fn) { cb.onSelect = fn; },
    set onUI(fn) { cb.onUI = fn; },
    set onToast(fn) { cb.onToast = fn; },
  };
})();
