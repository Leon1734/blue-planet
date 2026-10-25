/* ============================================================
   BluePlanet 数据看板（M6）
   - 手绘 Canvas 折线图：气温异常 / CO₂ 浓度 / 世界人口
   - 零依赖（不引图表库），首次打开时绘制
   ============================================================ */

const BPInsights = (() => {

  /* 把数据点画到 canvas 折线图（自适应 DPR） */
  function drawLine(canvas, chart) {
    const cssW = canvas.clientWidth || 560;
    const cssH = 150;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const padL = 44, padR = 12, padT = 12, padB = 22;
    const xs = chart.data.map(d => d[0]), ys = chart.data.map(d => d[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = (y1 - y0) * 0.15 || 1;
    y0 -= pad; y1 += pad;
    const X = (x) => padL + (x - x0) / (x1 - x0) * (cssW - padL - padR);
    const Y = (y) => padT + (1 - (y - y0) / (y1 - y0)) * (cssH - padT - padB);

    // 网格与 Y 轴刻度
    ctx.strokeStyle = 'rgba(122,178,214,0.18)';
    ctx.fillStyle = '#9FB6C9';
    ctx.font = '10px sans-serif';
    ctx.lineWidth = 1;
    for (let g = 0; g <= 3; g++) {
      const yv = y0 + (y1 - y0) * g / 3;
      const yy = Y(yv);
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(cssW - padR, yy); ctx.stroke();
      ctx.fillText(String(+yv.toFixed(2)), 4, yy + 3);
    }
    // X 轴首末刻度
    ctx.fillText(String(x0), padL - 12, cssH - 6);
    ctx.fillText(String(x1), cssW - padR - 24, cssH - 6);

    // 折线 + 渐变填充
    const color = chart.color;
    ctx.beginPath();
    chart.data.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineTo(X(chart.data[chart.data.length - 1][0]), Y(y0));
    ctx.lineTo(X(chart.data[0][0]), Y(y0));
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, padT, 0, cssH - padB);
    grad.addColorStop(0, color + '55');
    grad.addColorStop(1, color + '00');
    ctx.fillStyle = grad;
    ctx.fill();
    // 数据点
    ctx.fillStyle = color;
    chart.data.forEach(([x, y]) => {
      ctx.beginPath(); ctx.arc(X(x), Y(y), 2.5, 0, Math.PI * 2); ctx.fill();
    });
  }

  /* v21 学习进度仪表板 */
  function renderProgress(container) {
    const visited = (typeof BPGame !== 'undefined' && BPGame.profile) ? BPGame.profile.visited : [];
    const vSet = new Set(visited);
    const box = document.createElement('div');
    box.className = 'ins-progress';
    let html = `<div class="ins-title">📊 学习进度</div>`;
    html += `<div class="ins-progress-bar"><div class="ins-progress-fill" style="width:${(visited.length / BP_POIS.length * 100).toFixed(1)}%"></div></div>`;
    html += `<div class="ins-progress-text">${visited.length} / ${BP_POIS.length} 个知识点已点亮（${(visited.length / BP_POIS.length * 100).toFixed(1)}%）</div>`;
    html += '<div class="ins-modules">';
    for (const mod of BP_MODULES) {
      const all = BP_POIS.filter(p => p.module === mod.id);
      const done = all.filter(p => vSet.has(p.id)).length;
      const pct = all.length ? (done / all.length * 100).toFixed(0) : 0;
      html += `<div class="ins-mod-row">
        <span class="ins-mod-dot" style="background:${mod.color}"></span>
        <span class="ins-mod-name">${mod.name}</span>
        <div class="ins-mod-bar"><div class="ins-mod-fill" style="width:${pct}%;background:${mod.color}"></div></div>
        <span class="ins-mod-n">${done}/${all.length}</span>
      </div>`;
    }
    html += '</div>';
    const best = (typeof BPGame !== 'undefined' && BPGame.profile) ? BPGame.profile.quizBest : 0;
    if (best) html += `<div class="ins-quiz-best">🧠 闯关最佳：${best} 分</div>`;
    /* v31 错题与收藏概览 */
    const prof = (typeof BPGame !== 'undefined') ? BPGame.profile : null;
    const wrongN = prof ? Object.keys(prof.wrong || {}).length : 0;
    if (wrongN) html += `<div class="ins-quiz-best">📕 待攻克错题：${wrongN} 道（闯关里可重练）</div>`;
    const favN = prof ? (prof.favs || []).length : 0;
    if (favN) html += `<div class="ins-quiz-best">⭐ 已收藏：${favN} 个知识点</div>`;
    box.innerHTML = html;
    container.prepend(box);
  }

  function render(container) {
    container.innerHTML = '';
    if (typeof BPGame !== 'undefined') renderProgress(container);
    BP_CHARTS.forEach((chart, i) => {
      const box = document.createElement('div');
      box.className = 'ins-chart';
      box.innerHTML =
        `<div class="ins-title"><span style="color:${chart.color}">●</span> ${chart.t}</div>` +
        `<canvas></canvas>` +
        `<div class="ins-unit">单位：${chart.unit}</div>` +
        `<div class="ins-note">${chart.note}</div>`;
      container.appendChild(box);
      drawLine(box.querySelector('canvas'), chart);
    });
  }

  /* v22-c 学习报告导出：纯文本，方便家长/老师存档 */
  function buildReport() {
    const pf = BPGame.profile;
    const vSet = new Set(pf.visited || []);
    const L = [];
    const bar = (pct) => '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
    L.push('🌍 蓝色星球 · 学习报告');
    L.push('生成时间：' + new Date().toLocaleString('zh-CN'));
    L.push('═'.repeat(24));
    L.push('【总体进度】');
    const pctAll = pf.visited.length / BP_POIS.length * 100;
    L.push(`已探索知识点：${pf.visited.length} / ${BP_POIS.length}（${pctAll.toFixed(1)}%）${bar(pctAll)}`);
    if (pf.quizBest) L.push(`知识闯关最佳：${pf.quizBest} 分`);
    if (pf.puzzleWins) L.push(`大陆拼图完成：${pf.puzzleWins} 次`);
    const earnedNames = (pf.badges || [])
      .map(id => (BPGame.badges.find(b => b.id === id) || {}).t).filter(Boolean);
    L.push(`已获徽章：${earnedNames.length} 枚${earnedNames.length ? '（' + earnedNames.join('、') + '）' : ''}`);
    L.push('');
    L.push('【分模块进度】');
    for (const mod of BP_MODULES) {
      const all = BP_POIS.filter(p => p.module === mod.id);
      const done = all.filter(p => vSet.has(p.id)).length;
      const pct = all.length ? done / all.length * 100 : 0;
      L.push(`${mod.name}：${done}/${all.length}（${pct.toFixed(0)}%）${bar(pct)}`);
    }
    L.push('');
    const favList = (pf.favs || []).map(id => BP_POIS.find(p => p.id === id)).filter(Boolean);
    if (favList.length) {
      L.push('【我的收藏】');
      favList.forEach((p, i) => L.push(`  ${i + 1}. ${p.title}`));
      L.push('');
    }
    L.push('【已探索知识点清单】');
    for (const mod of BP_MODULES) {
      const done = BP_POIS.filter(p => p.module === mod.id && vSet.has(p.id));
      if (!done.length) continue;
      L.push(`◆ ${mod.name}`);
      done.forEach((p, i) => L.push(`  ${i + 1}. ${p.title}`));
    }
    if (!vSet.size) L.push('（还没有探索记录，快去点亮第一个知识点吧！）');
    L.push('');
    L.push('—— 来自蓝色星球（会转的地理课本）');
    return L.join('\n');
  }

  function exportReport() {
    const blob = new Blob(['\ufeff' + buildReport()], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    a.download = `蓝色星球学习报告_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }

  return { render, exportReport };
})();
