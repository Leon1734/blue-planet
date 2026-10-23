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

  return { render };
})();
