/* ============================================================
   BluePlanet 专题巡礼（M5）
   - 按主题串起知识站点：火山带 / 大陆之巅 / 极地与海平面
   - 每站：相机飞行 + 知识卡片；支持手动前后切换与 9 秒自动前进
   - 极点俯视：north() / south() 直接飞到极点上方俯瞰
   ============================================================ */

const BPTours = (() => {

  const cb = { onSelect: null };     // (poiId|null) 交给 main.js 的 selectPoi
  let cur = null;                    // { tour, idx }
  let timer = null;
  const AUTO_MS = 9000;

  function start(tourId) {
    const tour = BP_TOURS.find(x => x.id === tourId);
    if (!tour || !tour.stops.length) return;
    stop();
    cur = { tour, idx: 0 };
    goTo(0);
    arm();
    if (cb.onUI) cb.onUI();
  }

  function goTo(idx) {
    if (!cur) return;
    cur.idx = Math.max(0, Math.min(cur.tour.stops.length - 1, idx));
    const poiId = cur.tour.stops[cur.idx];
    if (cb.onSelect) cb.onSelect(poiId);
    if (cb.onUI) cb.onUI();
  }

  function next() { if (cur) { goTo(cur.idx + 1); arm(); } }
  function prev() { if (cur) { goTo(cur.idx - 1); arm(); } }

  function arm() {
    clearTimeout(timer);
    if (cur) timer = setTimeout(() => {
      if (!cur) return;
      if (cur.idx >= cur.tour.stops.length - 1) { stop(); if (cb.onUI) cb.onUI(); return; }
      next();
    }, AUTO_MS);
  }

  function stop() {
    clearTimeout(timer);
    timer = null;
    cur = null;
    if (cb.onUI) cb.onUI();
  }

  /* 极点俯视 */
  function north() {
    stop();
    if (cb.onSelect) cb.onSelect('north-pole');
  }
  function south() {
    stop();
    if (cb.onSelect) cb.onSelect('south-pole');
  }

  return {
    start, stop, next, prev, north, south,
    get running() { return !!cur; },
    get state() { return cur ? { tour: cur.tour, idx: cur.idx } : null; },
    set onSelect(fn) { cb.onSelect = fn; },
    set onUI(fn) { cb.onUI = fn; },
  };
})();
