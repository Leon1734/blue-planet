/* ============================================================
   BluePlanet 知识搜索（v3）
   - 索引：47 个知识点（标题/标签）+ 63 条地名标注
   - 模糊匹配打分，Enter 取首个，点击结果飞行
   - 全局 "/" 键聚焦
   ============================================================ */

const BPSearch = (() => {

  const $ = (id) => document.getElementById(id);

  /* v16 拼音首字母映射（常见缩写→汉字） */
  const PY_ALIAS = {
    'zmf': '珠穆朗玛峰', 'ml': '马德里', 'ynl': '亚马逊河', 'ymr': '湄公河',
    'hj': '黄河', 'cj': '长江', 'thz': '太湖', 'blh': '波罗的海',
    'lyh': '尼罗河', 'dj': '赤道', 'xj': '新疆', 'xz': '西藏',
    'sst': ' Sanct', 'hs': '火山', 'sd': '山东', 'hn': '海南',
  };

  let index = [];          // { type:'poi'|'label', title, sub, keywords, lat, lon, poiId }
  let cbSelect = null;     // (item)

  function build() {
    index = [];
    const modName = {};
    BP_MODULES.forEach(m => modName[m.id] = m.name);
    /* v21 模块名→关键词映射（搜索模块名可列出该模块全部 POI） */
    const MOD_KEYWORDS = {};
    for (const m of BP_MODULES) {
      MOD_KEYWORDS[m.name] = m.id;
      MOD_KEYWORDS[m.id] = m.id;
    }
    BP_POIS.forEach(p => {
      index.push({
        type: 'poi', title: p.title,
        sub: modName[p.module] + ' · 知识点',
        keywords: (p.title + ' ' + (p.tags || []).join(' ') + ' ' + (modName[p.module] || '')).toLowerCase(),
        lat: p.lat, lon: p.lon, poiId: p.id,
      });
    });
    BP_LABELS.forEach(L => {
      index.push({
        type: 'label', title: L.t,
        sub: '地名标注',
        keywords: L.t.toLowerCase(),
        lat: L.lat, lon: L.lon,
      });
    });
  }

  function query(text) {
    let q = text.trim().toLowerCase();
    /* v16 拼音别名展开 */
    if (PY_ALIAS[q]) q = PY_ALIAS[q].toLowerCase();
    if (!q) return [];
    const scored = [];
    for (const it of index) {
      const t = it.title.toLowerCase();
      let s = -1;
      if (t.includes(q)) s = 100 - t.indexOf(q);
      else if (it.keywords.includes(q)) s = 50;
      else if (it.sub && it.sub.toLowerCase().includes(q)) s = 40;
      else {
        // 逐字匹配（支持"珠峰"→"珠穆朗玛峰"式部分命中）
        const hits = [...q].filter(ch => t.includes(ch)).length;
        if (hits >= Math.max(2, Math.ceil(q.length * 0.6))) s = hits;
      }
      if (s >= 0) scored.push({ it, s });
    }
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, 8).map(x => x.it);
  }

  function render(list) {
    const box = $('searchDrop');
    if (!list.length) { box.classList.add('hidden'); return; }
    box.innerHTML = list.map((it, i) =>
      `<button class="search-item" data-i="${i}">
        <span class="search-ico">${it.type === 'poi' ? '📍' : '🏔'}</span>
        <span class="search-title">${it.title}</span>
        <span class="search-sub">${it.sub}</span>
      </button>`).join('');
    box.classList.remove('hidden');
    box.querySelectorAll('.search-item').forEach(btn => {
      btn.addEventListener('click', () => go(list[+btn.dataset.i]));
    });
  }

  function go(item) {
    if (!item) return;
    $('searchDrop').classList.add('hidden');
    $('searchInput').value = '';
    $('searchInput').blur();
    if (item.type === 'poi' && cbSelect) cbSelect(item.poiId);
    else BPScene.flyTo(item.lat, item.lon, 235, 1400);
  }

  function init(onSelect) {
    cbSelect = onSelect;
    build();
    const input = $('searchInput');
    input.addEventListener('input', () => render(query(input.value)));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const list = query(input.value);
        if (list.length) go(list[0]);
      } else if (e.key === 'Escape') {
        $('searchDrop').classList.add('hidden');
        input.blur();
      }
    });
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('#searchBox')) $('searchDrop').classList.add('hidden');
    });
  }

  return { init, query };
})();
