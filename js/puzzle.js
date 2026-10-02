/* ============================================================
   BluePlanet 大陆拼图（v7 / P1）
   - 拼片直接从 NASA 昼贴图按大陆多边形裁剪（等距圆柱投影）
   - 拖拽到世界地图正确位置 → 中心进入容差即吸附归位
   - 三档难度：简单（显示虚线目标+洲名）/ 标准（无提示）/ 困难（更小容差+无洲名）
   - 计时 + 本机最佳成绩（localStorage bp_puzzle_v1）+ 首次完成解锁 🧩 徽章
   ============================================================ */

const BPPuzzle = (() => {

  const $ = (id) => document.getElementById(id);
  const CW = 1000, CH = 720;          // 画布内部分辨率
  const MAP_Y = 40, MAP_H = 500;      // 地图区（等距圆柱 2:1）
  const TRAY_Y = MAP_Y + MAP_H;       // 托盘区 540..720
  const FLOAT_S = 0.45;               // 拼片悬停显示比例

  const DIFF = {
    easy:   { tol: 70, ghost: true,  label: true,  bg: 0.34 },
    normal: { tol: 45, ghost: false, label: true,  bg: 0.15 },
    hard:   { tol: 30, ghost: false, label: false, bg: 0.06 },
  };

  /* 拼图专用大陆轮廓（等距圆柱 2D 安全：不跨 180° 经线） */
  const PUZZLE_CONTINENTS = [
    { name: '北美洲', poly: [[68, -95], [70, -70], [62, -50], [50, -55], [40, -70], [30, -80], [15, -85], [0, -78], [-8, -70], [-18, -63], [-35, -58], [-52, -68], [-45, -78], [-25, -80], [-5, -82], [8, -85], [20, -95], [35, -105], [50, -110], [60, -125], [68, -140], [70, -160], [65, -165]] },
    { name: '欧亚大陆', poly: [[71, 10], [72, 45], [75, 80], [74, 115], [68, 140], [62, 160], [55, 166], [48, 142], [40, 128], [32, 121], [22, 109], [10, 105], [2, 103], [8, 95], [20, 88], [30, 78], [28, 66], [36, 58], [32, 48], [30, 38], [36, 28], [40, 22], [44, 12], [48, 2], [54, 3], [58, 8], [63, 3]] },
    { name: '非洲', poly: [[35, -6], [32, 10], [30, 25], [28, 35], [12, 43], [-2, 41], [-12, 40], [-25, 33], [-34, 20], [-33, 17], [-20, 12], [-8, 13], [2, 9], [5, -5], [8, -12], [15, -17], [25, -14], [30, -10]] },
    { name: '南美洲', poly: [[12, -72], [10, -62], [-2, -55], [-8, -35], [-18, -39], [-28, -48], [-38, -57], [-52, -68], [-55, -72], [-45, -74], [-30, -72], [-15, -76], [-2, -81], [8, -80]] },
    { name: '大洋洲', poly: [[-12, 130], [-14, 136], [-18, 142], [-12, 143], [-16, 146], [-25, 153], [-32, 152], [-38, 148], [-38, 141], [-34, 135], [-33, 125], [-30, 115]] },
    { name: '格陵兰', poly: [[83, -35], [78, -20], [70, -22], [60, -42], [65, -52], [75, -58], [80, -55]] },
  ];

  let img = null;                     // 昼贴图 Image
  let pieces = [];                    // { name, poly, pc, w, h, cx, cy(正确左上), x, y, placed, pulse }
  let mode = 'normal';
  let raf = 0;
  let started = 0, startedAt = 0, completed = false;
  let drag = null;                    // { p, dx, dy }
  let hover = null;
  let open = false;

  /* ---------- 投影（等距圆柱） ---------- */
  const px = (lon) => (lon + 180) / 360 * CW;
  const py = (lat) => MAP_Y + (90 - lat) / 180 * MAP_H;

  /* ---------- 拼片裁剪 ---------- */
  function cutPiece(name, poly) {
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    const pts = poly.map(([la, lo]) => {
      const x = px(lo), y = py(la);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      return [x, y];
    });
    const w = Math.max(12, Math.round(maxX - minX));
    const h = Math.max(12, Math.round(maxY - minY));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    /* 从贴图裁剪对应区域（源图为 2048×1024 等距圆柱） */
    const sx = (minX / CW) * img.width;
    const sy = ((minY - MAP_Y) / MAP_H) * img.height;
    const sw = (w / CW) * img.width;
    const sh = (h / MAP_H) * img.height;
    ctx.save();
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const lx = x - minX, ly = y - minY;
      if (i) ctx.lineTo(lx, ly); else ctx.moveTo(lx, ly);
    });
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    ctx.restore();
    /* 描边让拼片轮廓清晰 */
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const lx = x - minX, ly = y - minY;
      if (i) ctx.lineTo(lx, ly); else ctx.moveTo(lx, ly);
    });
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    return { name, poly: pts, pc: c, w, h, cx: minX, cy: minY };
  }

  /* ---------- 开局：洗牌布局 ---------- */
  function layout() {
    startedAt = 0; started = 0;
    const S = FLOAT_S;
    let x = 16;
    const gap = 10;
    for (const p of pieces) {
      p.placed = false;
      p.pulse = 0;
      p.x = x;
      p.y = TRAY_Y + (TRAY_Y < 0 ? 0 : (CH - TRAY_Y - p.h * S) / 2);
      x += p.w * S + gap;
    }
    /* 若一行放不下则整体等比缩紧凑 */
    const used = x - gap + 16;
    if (used > CW) {
      const k = CW / used;
      let x2 = 8;
      for (const p of pieces) {
        p.x = x2;
        x2 += p.w * S * k + 6;
      }
    }
    completed = false; drag = null;
  }

  /* ---------- 重置/难度 ---------- */
  function restart() {
    init().then(() => { layout(); draw(); });
  }
  function setDifficulty(m) {
    mode = m;
    if (open) restart();
  }

  /* ---------- 打开/关闭 ---------- */
  function openModal() {
    const modal = $('puzzleModal');
    if (modal) modal.classList.remove('hidden');   // 独立分享页无模态壳，直接画布
    open = true;
    init().then(() => {
      layout();
      loop();
      const best = bestTime();
      const bt = best[mode] ? `　最佳 ${fmt(best[mode])}` : '';
      if (typeof BPPanels !== 'undefined') BPPanels.toast('🧩 把大陆拖到地图上正确的位置！' + bt);
    });
  }
  function close() {
    const modal = $('puzzleModal');
    if (modal) modal.classList.add('hidden');
    open = false;
    cancelAnimationFrame(raf);
  }

  /* ---------- 初始化（裁片，只做一次） ---------- */
  let ready = false;
  function init() {
    if (ready) return Promise.resolve();
    return BPTextures.load().then((t) => {
      img = t.earthDay.image;
      pieces = PUZZLE_CONTINENTS.map(c => cutPiece(c.name, c.poly));
      /* 宽者在左，视觉更稳 */
      pieces.sort((a, b) => b.w - a.w);
      /* 托盘可放下性：等宽缩排由 layout 处理 */
      ready = true;
    });
  }

  /* ---------- 绘制 ---------- */
  function draw() {
    const cv = $('puzzleCanvas');
    const ctx = cv.getContext('2d');
    const D = DIFF[mode];
    ctx.clearRect(0, 0, CW, CH);
    /* 背景 */
    ctx.fillStyle = '#0a1420';
    ctx.fillRect(0, 0, CW, CH);
    /* 地图底：暗淡的贴图（难度越高越暗） */
    ctx.save();
    ctx.globalAlpha = D.bg;
    ctx.drawImage(img, 0, MAP_Y, CW, MAP_H);
    ctx.restore();
    /* 地图边框与经纬网 */
    ctx.strokeStyle = 'rgba(122,178,214,0.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.75, MAP_Y + 0.75, CW - 1.5, MAP_H - 1.5);
    ctx.strokeStyle = 'rgba(122,178,214,0.22)';
    ctx.lineWidth = 1;
    for (let lon = -150; lon <= 150; lon += 30) {
      const x = px(lon);
      ctx.beginPath(); ctx.moveTo(x, MAP_Y); ctx.lineTo(x, MAP_Y + MAP_H); ctx.stroke();
      ctx.fillStyle = 'rgba(159,182,201,0.6)'; ctx.font = '11px sans-serif';
      ctx.fillText(lon + '°', x + 3, MAP_Y + 14);
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const y = py(lat);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke();
      ctx.fillStyle = 'rgba(159,182,201,0.6)';
      ctx.fillText(lat + '°', 4, y - 3);
    }
    /* 赤道加亮 */
    ctx.strokeStyle = 'rgba(255,159,69,0.35)';
    ctx.beginPath(); ctx.moveTo(0, py(0)); ctx.lineTo(CW, py(0)); ctx.stroke();

    const now = performance.now();
    /* 目标虚影（简单模式）：poly 即地图坐标下的正确轮廓 */
    if (D.ghost) {
      ctx.setLineDash([7, 6]);
      ctx.strokeStyle = 'rgba(255,255,255,0.38)';
      ctx.lineWidth = 1.6;
      for (const p of pieces) {
        if (p.placed) continue;
        ctx.beginPath();
        p.poly.forEach(([x, y], i) => {
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.closePath(); ctx.stroke();
        if (D.label) {
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(p.name, p.cx + p.w / 2, p.cy + p.h / 2);
          ctx.textAlign = 'left';
        }
      }
      ctx.setLineDash([]);
    }
    /* 已归位 */
    for (const p of pieces) {
      if (!p.placed) continue;
      ctx.drawImage(p.pc, p.cx, p.cy);
      if (p.pulse > 0) {
        const a = p.pulse / 500;
        ctx.save();
        ctx.globalAlpha = a * 0.6;
        ctx.strokeStyle = '#3DBE8B';
        ctx.lineWidth = 3 + (1 - a) * 4;
        ctx.strokeRect(p.cx, p.cy, p.w, p.h);
        ctx.restore();
        p.pulse = Math.max(0, p.pulse - 16);
      }
      if (mode !== 'hard') {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.name, p.cx + p.w / 2, p.cy + p.h + 14);
        ctx.textAlign = 'left';
      }
    }
    /* 悬停/拖动中的拼片 */
    const S = FLOAT_S;
    for (const p of pieces) {
      if (p.placed) continue;
      const dragging = drag && drag.p === p;
      const s = dragging ? S * 1.06 : S;
      ctx.save();
      if (dragging) {
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 5;
      }
      ctx.drawImage(p.pc, p.x, p.y, p.w * s, p.h * s);
      ctx.restore();
      if (mode !== 'hard' || dragging) {
        ctx.fillStyle = dragging ? '#FF9F45' : 'rgba(232,241,248,0.85)';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.name, p.x + p.w * s / 2, p.y - 6);
        ctx.textAlign = 'left';
      }
    }
    /* 托盘提示 */
    ctx.fillStyle = 'rgba(159,182,201,0.5)';
    ctx.font = '11px sans-serif';
    ctx.fillText('拼片托盘', 8, TRAY_Y - 6);
    /* HUD */
    const placedN = pieces.filter(p => p.placed).length;
    ctx.fillStyle = '#E8F1F8';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`已归位 ${placedN} / ${pieces.length}`, 12, 26);
    ctx.textAlign = 'right';
    const t = elapsed();
    ctx.fillStyle = completed ? '#3DBE8B' : '#FF9F45';
    ctx.fillText(`⏱ ${fmt(t)}`, CW - 12, 26);
    const best = bestTime();
    if (best[mode]) {
      ctx.fillStyle = 'rgba(159,182,201,0.75)';
      ctx.font = '12px sans-serif';
      ctx.fillText(`最佳 ${fmt(best[mode])}`, CW - 12, 44);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(159,182,201,0.75)';
    ctx.font = '12px sans-serif';
    ctx.fillText(`难度：${({ easy: '简单', normal: '标准', hard: '困难' })[mode]}`, 12, 46);

    /* 完成庆祝 */
    if (completed) {
      ctx.save();
      ctx.fillStyle = 'rgba(10,20,32,0.72)';
      ctx.fillRect(0, 0, CW, CH);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#3DBE8B';
      ctx.font = 'bold 40px sans-serif';
      ctx.fillText('🎉 拼图完成！', CW / 2, CH / 2 - 30);
      ctx.fillStyle = '#E8F1F8';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(`用时 ${fmt(t)} · ${({ easy: '简单', normal: '标准', hard: '困难' })[mode]}`, CW / 2, CH / 2 + 16);
      const best = bestTime();
      ctx.fillStyle = '#FF9F45';
      ctx.font = '16px sans-serif';
      ctx.fillText(`本机最佳 ${fmt(best[mode] || t)} · 点「重开」再来一局`, CW / 2, CH / 2 + 52);
      ctx.textAlign = 'left';
      ctx.restore();
    }
  }

  function loop() {
    if (!open) return;
    raf = requestAnimationFrame(loop);
    draw();
  }

  /* ---------- 计时与成绩 ---------- */
  function elapsed() {
    if (!startedAt) return 0;
    return Math.floor((performance.now() - startedAt) / 1000);
  }
  function fmt(s) {
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  function bestTime() {
    try { return JSON.parse(localStorage.getItem('bp_puzzle_v1') || '{}'); } catch (e) { return {}; }
  }
  function saveBest(sec) {
    const b = bestTime();
    if (!b[mode] || sec < b[mode]) {
      b[mode] = sec;
      try { localStorage.setItem('bp_puzzle_v1', JSON.stringify(b)); } catch (e) {}
    }
  }

  /* ---------- 指针交互 ---------- */
  function toCanvas(e) {
    const cv = $('puzzleCanvas');
    const r = cv.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (CW / r.width),
      y: (e.clientY - r.top) * (CH / r.height),
    };
  }
  function hitPiece(x, y) {
    const S = FLOAT_S;
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i];
      if (p.placed) continue;
      if (x >= p.x - 6 && x <= p.x + p.w * S + 6 && y >= p.y - 6 && y <= p.y + p.h * S + 6) return p;
    }
    return null;
  }
  function wirePointer() {
    const cv = $('puzzleCanvas');
    cv.addEventListener('pointerdown', (e) => {
      const pt = toCanvas(e);
      const p = hitPiece(pt.x, pt.y);
      if (!p) return;
      drag = { p, dx: pt.x - p.x, dy: pt.y - p.y };
      /* 提到最上层 */
      pieces.splice(pieces.indexOf(p), 1);
      pieces.push(p);
      if (!startedAt) startedAt = performance.now();
      cv.style.cursor = 'grabbing';
      e.preventDefault();
    });
    window.addEventListener('pointermove', (e) => {
      if (!open) return;
      const pt = toCanvas(e);
      if (drag) {
        drag.p.x = Math.max(-20, Math.min(CW - 20, pt.x - drag.dx));
        drag.p.y = Math.max(MAP_Y - 40, Math.min(CH - 20, pt.y - drag.dy));
        return;
      }
      const h = hitPiece(pt.x, pt.y);
      if (h !== hover) {
        hover = h;
        cv.style.cursor = h ? 'grab' : 'default';
      }
    });
    window.addEventListener('pointerup', () => {
      if (!drag) return;
      const p = drag.p;
      drag = null;
      /* 吸附判定：拼片中心 vs 正确中心 */
      const S = FLOAT_S;
      const cxNow = p.x + p.w * S / 2;
      const cyNow = p.y + p.h * S / 2;
      const dx = Math.abs(cxNow - (p.cx + p.w / 2));
      const dy = Math.abs(cyNow - (p.cy + p.h / 2));
      if (dx < DIFF[mode].tol && dy < DIFF[mode].tol) {
        p.placed = true;
        p.pulse = 500;
        /* 全完成 */
        if (pieces.every(x => x.placed)) {
          completed = true;
          const sec = elapsed();
          saveBest(sec);
          if (typeof BPGame !== 'undefined' && BPGame.markPuzzle) {
            const fresh = BPGame.markPuzzle();
            fresh.forEach(id => {
              const def = BPGame.badges.find(b => b.id === id);
              if (def && typeof BPPanels !== 'undefined') BPPanels.toast(`🏅 解锁徽章：${def.icon} ${def.t}`);
            });
          }
          if (typeof BPPanels !== 'undefined') BPPanels.toast(`🎉 拼图完成！用时 ${fmt(sec)}`);
        }
      }
    });
  }

  wirePointer();

  return {
    open: openModal, close, restart, setDifficulty,
    drawNow: draw,          // 手动重绘（测试/遮挡环境强制刷新）
    get isOpen() { return open; },
    get state() { return { pieces, mode, completed }; },   // 供测试
  };
})();
