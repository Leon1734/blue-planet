/* ============================================================
   BluePlanet 知识总览（v18）
   - 154 个知识点按 9 模块分组浏览，支持模块筛选 + 标题/标签搜索
   - 显示难度星、已点亮状态（✓），点击条目飞达并开卡
   - 入口：左侧模块导航头部 📚 按钮
   ============================================================ */

const BPCatalog = (() => {

  const $ = (id) => document.getElementById(id);
  let filter = 'all';
  let query = '';
  let onlyUnvisited = false;   // v19：只看未点亮
  let onlyFavs = false;        // v24：只看收藏

  function open() {
    /* 每次打开重置筛选与搜索，避免上次状态干扰 */
    filter = 'all';
    query = '';
    onlyUnvisited = false;
    onlyFavs = false;
    const si = $('catSearch');
    if (si) si.value = '';
    $('catalogModal').classList.remove('hidden');
    renderFilters();
    renderList();
    setTimeout(() => $('catSearch').focus(), 80);
  }
  function close() {
    $('catalogModal').classList.add('hidden');
  }

  function renderFilters() {
    const box = $('catFilters');
    const counts = {};
    BP_POIS.forEach(p => { counts[p.module] = (counts[p.module] || 0) + 1; });
    const chips = [{ id: 'all', name: '全部', color: '#E8F1F8', n: BP_POIS.length }]
      .concat(BP_MODULES.map(m => ({ id: m.id, name: m.name, color: m.color, n: counts[m.id] || 0 })));
    box.innerHTML = chips.map(c =>
      `<button class="cat-chip${filter === c.id ? ' on' : ''}" data-m="${c.id}">
        <span class="dot" style="background:${c.color}"></span>${c.name}<i>${c.n}</i>
      </button>`).join('');
    /* v19：只看未点亮 */
    const visitedSet = (typeof BPGame !== 'undefined' && BPGame.profile) ? new Set(BPGame.profile.visited) : new Set();
    const left = BP_POIS.filter(p => !visitedSet.has(p.id)).length;
    box.insertAdjacentHTML('beforeend',
      `<button class="cat-chip cat-only-unvisited${onlyUnvisited ? ' on' : ''}" id="catOnlyUnvisited">
        <span class="dot" style="background:var(--c-orange)"></span>只看未点亮<i>${left}</i>
      </button>`);
    /* v24：只看收藏 */
    const favSet = (typeof BPGame !== 'undefined' && BPGame.profile && BPGame.profile.favs) ? new Set(BPGame.profile.favs) : new Set();
    const favN = BP_POIS.filter(p => favSet.has(p.id)).length;
    box.insertAdjacentHTML('beforeend',
      `<button class="cat-chip cat-only-favs${onlyFavs ? ' on' : ''}" id="catOnlyFavs">
        <span class="dot" style="background:#ffc94d"></span>⭐ 收藏<i>${favN}</i>
      </button>`);
    box.querySelectorAll('.cat-chip[data-m]').forEach(b => {
      b.addEventListener('click', () => {
        filter = b.dataset.m;
        renderFilters();
        renderList();
      });
    });
    $('catOnlyUnvisited').addEventListener('click', () => {
      onlyUnvisited = !onlyUnvisited;
      renderFilters();
      renderList();
    });
    $('catOnlyFavs').addEventListener('click', () => {
      onlyFavs = !onlyFavs;
      renderFilters();
      renderList();
    });
  }

  function renderList() {
    const visited = (typeof BPGame !== 'undefined' && BPGame.profile) ? new Set(BPGame.profile.visited) : new Set();
    const favSet = (typeof BPGame !== 'undefined' && BPGame.profile && BPGame.profile.favs) ? new Set(BPGame.profile.favs) : new Set();
    const q = query.trim().toLowerCase();
    const match = (p) => {
      if (!q) return true;
      const hay = (p.title + ' ' + (p.tags || []).join(' ')).toLowerCase();
      if (hay.includes(q)) return true;
      /* 逐字匹配：支持「珠峰」→「珠穆朗玛峰」这类缩写 */
      if (q.length >= 2) {
        const chars = [...q].filter(ch => ch.trim());
        return chars.length >= 2 && chars.every(ch => hay.includes(ch));
      }
      return false;
    };
    const list = BP_POIS.filter(p =>
      (filter === 'all' || p.module === filter) &&
      (!onlyUnvisited || !visited.has(p.id)) &&
      (!onlyFavs || favSet.has(p.id)) &&
      match(p));

    const box = $('catList');
    $('catalogCount').textContent = `${list.length} / ${BP_POIS.length}`;
    if (!list.length) {
      box.innerHTML = '<div class="cat-empty">没有匹配的知识点</div>';
      return;
    }
    /* 按模块分组（保持 BP_MODULES 顺序） */
    const groups = new Map();
    for (const p of list) {
      if (!groups.has(p.module)) groups.set(p.module, []);
      groups.get(p.module).push(p);
    }
    const order = BP_MODULES.map(m => m.id);
    let html = '';
    for (const mid of order) {
      const arr = groups.get(mid);
      if (!arr) continue;
      const mod = BP_MODULES.find(m => m.id === mid);
      html += `<div class="cat-group">
        <div class="cat-group-title"><span class="dot" style="background:${mod.color}"></span>${mod.name}<i>${arr.length}</i></div>
        <div class="cat-items">` +
        arr.map(p => {
          const on = visited.has(p.id);
          return `<button class="cat-item${on ? ' visited' : ''}" data-poi="${p.id}" title="${p.summary.replace(/"/g, '&quot;')}">
            <span class="cat-item-title">${p.title}</span>
            <span class="cat-item-meta">${favSet.has(p.id) ? '<b class="cat-fav">⭐</b>' : ''}${'★'.repeat(p.difficulty)}${on ? '<b class="cat-ok">✓</b>' : ''}</span>
          </button>`;
        }).join('') +
        `</div></div>`;
    }
    box.innerHTML = html;
    box.querySelectorAll('.cat-item').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.dataset.poi;
        close();
        if (typeof BPPanels !== 'undefined' && BPPanels.selectApi) BPPanels.selectApi.selectPoi(id);
      });
    });
  }

  function init() {
    const btn = $('btnCatalog');
    if (btn) btn.addEventListener('click', open);
    const closeBtn = $('catalogClose');
    if (closeBtn) closeBtn.addEventListener('click', close);
    const modal = $('catalogModal');
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    const input = $('catSearch');
    if (input) input.addEventListener('input', () => { query = input.value; renderList(); });
  }

  return { init, open, close };
})();
