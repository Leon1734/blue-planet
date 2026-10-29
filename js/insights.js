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

  /* v35 网页版学习报告：亮色排版 + 进度条 + 表格，可直接打印成 PDF */
  function buildReportHtml() {
    const pf = BPGame.profile;
    const vSet = new Set(pf.visited || []);
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const pctAll = pf.visited.length / BP_POIS.length * 100;
    const earned = (pf.badges || [])
      .map(id => BPGame.badges.find(b => b.id === id)).filter(b => b && b.t);

    const bar = (pct, color) =>
      `<span class="bar"><i style="width:${Math.min(100, pct).toFixed(1)}%;background:${color || '#3DBE8B'}"></i></span>`;

    const modRows = BP_MODULES.map(m => {
      const all = BP_POIS.filter(p => p.module === m.id);
      const done = all.filter(p => vSet.has(p.id)).length;
      const pct = all.length ? done / all.length * 100 : 0;
      return `<tr><td><span class="dot" style="background:${m.color}"></span>${esc(m.name)}</td>
        <td class="num">${done}/${all.length}</td><td>${bar(pct, m.color)}<em>${pct.toFixed(0)}%</em></td></tr>`;
    }).join('');

    /* v39 打卡热力图：近 16 周 GitHub 风格网格（数据源 profile.days，v39 起记录） */
    const days = pf.days || {};
    const DAY = 86400000;
    const end = new Date(); end.setHours(0, 0, 0, 0);
    const dow = (end.getDay() + 6) % 7;   // 周一=0 … 周日=6
    const HEAT_WEEKS = 16;
    const start = new Date(end.getTime() - (HEAT_WEEKS * 7 - 1 - dow) * DAY);
    let heatCols = '', activeDays = 0;
    for (let w = 0; w < HEAT_WEEKS; w++) {
      let col = '';
      for (let d = 0; d < 7; d++) {
        const t = new Date(start.getTime() + (w * 7 + d) * DAY);
        const key = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
        const n = days[key] || 0;
        if (n > 0) activeDays++;
        const lv = n === 0 ? 0 : n <= 2 ? 1 : n <= 4 ? 2 : 3;
        const dim = t > end ? ' style="opacity:.18"' : '';
        col += `<i class="hc lv${lv}"${dim} title="${key} · ${n} 次"></i>`;
      }
      heatCols += `<span class="hcol">${col}</span>`;
    }

    const favList = (pf.favs || []).map(id => BP_POIS.find(p => p.id === id)).filter(Boolean);
    const favHtml = favList.length
      ? `<div class="fav-grid">${favList.map(p => {
          const m = BP_MODULES.find(x => x.id === p.module);
          return `<span class="fav-chip"><span class="dot" style="background:${m ? m.color : '#8FC8E8'}"></span>${esc(p.title)}</span>`;
        }).join('')}</div>`
      : '<p class="empty">还没有收藏，遇到喜欢的知识点点 ⭐ 收藏吧。</p>';

    /* v36 页脚二维码：扫码直达线上站（离线时仍指向 Pages 站址） */
    let qrImg = '';
    try {
      if (typeof qrcode !== 'undefined') {
        const site = location.protocol.startsWith('http')
          ? (location.origin + location.pathname)
          : 'https://leon1734.github.io/blue-planet/';
        const qr = qrcode(0, 'M');
        qr.addData(site);
        qr.make();
        qrImg = `<img class="qr" src="${qr.createDataURL(5, 8)}" alt="扫码打开蓝色星球" width="86" height="86">`;
      }
    } catch (e) { /* 二维码失败不影响报告 */ }

    const listHtml = BP_MODULES.map(m => {
      const done = BP_POIS.filter(p => p.module === m.id && vSet.has(p.id));
      if (!done.length) return '';
      return `<h3><span class="dot" style="background:${m.color}"></span>${esc(m.name)}（${done.length}）</h3>
        <ul class="cols">${done.map(p => `<li>${esc(p.title)}</li>`).join('')}</ul>`;
    }).join('') || '<p class="empty">还没有探索记录，快去点亮第一个知识点吧！</p>';

    return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>蓝色星球学习报告 ${dateStr}</title>
<style>
body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;max-width:820px;margin:0 auto;padding:36px 24px;color:#1c3242;line-height:1.75;background:#fff}
h1{font-size:24px;margin:0 0 2px}
.meta{color:#7d97ad;font-size:13px;margin-bottom:18px}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 20px}
.chip{background:#eef5fa;border:1px solid #d7e6f0;border-radius:999px;padding:3px 13px;font-size:13px}
.chip b{color:#0d1b2a}
h2{font-size:16px;margin:26px 0 10px;padding-left:9px;border-left:4px solid #3DBE8B}
.bar{display:inline-block;vertical-align:middle;width:180px;height:10px;background:#e8eef3;border-radius:6px;overflow:hidden;margin-right:8px}
.bar i{display:block;height:100%;border-radius:6px}
table{width:100%;border-collapse:collapse}
td,th{padding:8px 6px;border-bottom:1px solid #e4edf3;text-align:left;font-size:14px}
td .dot,th .dot,h3 .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:middle}
.num{white-space:nowrap;color:#5c788d}
td em{font-style:normal;color:#7d97ad;font-size:12.5px}
.badge{display:inline-block;background:#fff7e0;border:1px solid #f0d98c;border-radius:8px;padding:3px 11px;margin:3px 4px 3px 0;font-size:13px}
.fav-grid{display:flex;flex-wrap:wrap;gap:7px}
.fav-chip{background:#fdf6e7;border:1px solid #f2e3b8;border-radius:999px;padding:3px 12px;font-size:13px}
ul.cols{columns:2;margin:6px 0 14px;padding-left:22px}
ul.cols li{font-size:13.5px;margin-bottom:2px;break-inside:avoid}
h3{font-size:14px;margin:16px 0 4px}
.empty{color:#9ab2c4;font-size:13.5px}
footer{margin-top:30px;padding-top:12px;border-top:1px solid #e4edf3;color:#8aa2b5;font-size:12.5px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px}
.qr-wrap{display:flex;align-items:center;gap:6px;text-align:left}
.qr-wrap i{font-style:normal;font-size:11px;line-height:1.35;color:#8aa2b5}
.qr{display:block;border:1px solid #e4edf3;border-radius:4px}
.heat{display:flex;gap:3px;margin:4px 0 6px}
.hcol{display:flex;flex-direction:column;gap:3px}
.hc{width:11px;height:11px;border-radius:2px;background:#eef3f7}
.hc.lv1{background:#bfe6cf}.hc.lv2{background:#67c98f}.hc.lv3{background:#2f9e5f}
@media print{body{padding:0}.bar{width:150px}}
</style></head><body>
<h1>🌍 蓝色星球 · 学习报告</h1>
<div class="meta">生成时间 ${dateStr} · 会转的地理课本 leon1734.github.io/blue-planet</div>
<div class="chips">
  <span class="chip">已探索 <b>${pf.visited.length}</b> / ${BP_POIS.length}（${pctAll.toFixed(1)}%）</span>
  ${pf.quizBest ? `<span class="chip">闯关最佳 <b>${pf.quizBest}</b> 分</span>` : ''}
  ${pf.puzzleWins ? `<span class="chip">拼图完成 <b>${pf.puzzleWins}</b> 次</span>` : ''}
  <span class="chip">徽章 <b>${earned.length}</b> 枚</span>
  <span class="chip">收藏 <b>${favList.length}</b> 个</span>
</div>
<h2>总体进度</h2>
<div>${bar(pctAll)}<em style="color:#7d97ad;font-size:13px">${pctAll.toFixed(1)}%</em></div>
<h2>分模块进度</h2>
<table><tr><th>模块</th><th>点亮</th><th>进度</th></tr>${modRows}</table>
<h2>打卡热力图（近 16 周）</h2>
<div class="heat">${heatCols}</div>
<p class="empty">累计活跃 ${activeDays} 天 · 点亮知识点或完成一次闯关记 1 次（v39 起记录）</p>
<h2>徽章墙</h2>
${earned.length ? earned.map(b => `<span class="badge">${b.icon || '🏅'} ${esc(b.t)}</span>`).join('') : '<p class="empty">还没有徽章，去解锁第一枚吧。</p>'}
<h2>我的收藏</h2>
${favHtml}
<h2>已探索知识点</h2>
${listHtml}
<footer><span>🌍 蓝色星球 · 会转的地理课本</span><span class="qr-wrap">${qrImg}<i>扫码打开<br>线上课堂</i></span><span>leon1734.github.io/blue-planet · ${dateStr}</span></footer>
</body></html>`;
  }

  function exportReportHtml() {
    try {
      const blob = new Blob([buildReportHtml()], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      a.download = `蓝色星球学习报告_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      if (typeof BPPanels !== 'undefined' && BPPanels.toast) BPPanels.toast('🌐 网页报告已下载（浏览器打开可打印成 PDF）');
      return true;
    } catch (e) { return false; }
  }

  return { render, exportReport, exportReportHtml, buildReportHtml };
})();
