/* ============================================================
   BluePlanet 地理实验室（v3）
   - 🌋 火山喷发模拟器：黏度/气体含量滑块 → 宁静式↔爆炸式
     Canvas 粒子系统（熔岩弹道 + 火山灰柱 + 坡面熔岩流）
   - 🧱 板块运动沙盘：拖拽两块板块 → 实时判定汇聚/离散/转换
     剖面地形随之隆起/裂开/错动抖动
   - 各自独立 rAF，面板关闭即停
   ============================================================ */

const BPLab = (() => {

  const $ = (id) => document.getElementById(id);
  let tab = 'volcano';
  let volRaf = 0, plateRaf = 0;

  /* ================================================================
     火山模拟器
     ================================================================ */
  const vol = { v: 0.3, g: 0.5, parts: [], flows: [], t: 0, burstCd: 0, quakes: [] };

  function volStyle() {
    const e = vol.g * (0.35 + 0.65 * vol.v);   // 爆发指数
    if (e < 0.3) return { name: '宁静式（夏威夷型）', power: 0.35, spread: 0.25, ash: 0.05 };
    if (e < 0.6) return { name: '斯特龙博利式', power: 0.62, spread: 0.5, ash: 0.35 };
    return { name: '普林尼式（爆炸式）', power: 1.0, spread: 0.8, ash: 1.0 };
  }

  function volSpawn(w, h) {
    const st = volStyle();
    const cx = w * 0.5, baseY = h * 0.78, topY = h * 0.38;
    const n = 1 + Math.round(st.power * 3);
    for (let i = 0; i < n; i++) {
      const up = -(3 + st.power * 9) * (0.6 + Math.random() * 0.8);
      const vx = (Math.random() - 0.5) * (1.5 + st.spread * 6);
      vol.parts.push({
        x: cx + (Math.random() - 0.5) * 14, y: topY,
        vx: vol.g > 0.75 && vol.v > 0.6 ? vx * 1.6 : vx,
        vy: up, r: 2 + Math.random() * 3.5,
        life: 1, ash: Math.random() < st.ash,
      });
    }
    // 爆炸式：间歇强喷
    vol.burstCd--;
    if (st.ash > 0.6 && vol.burstCd <= 0) {
      vol.burstCd = 50;
      for (let i = 0; i < 40; i++) {
        vol.parts.push({
          x: cx + (Math.random() - 0.5) * 20, y: topY,
          vx: (Math.random() - 0.5) * 3, vy: -(8 + Math.random() * 7),
          r: 3 + Math.random() * 4, life: 1.4, ash: true,
        });
      }
    }
    // 宁静式：坡面熔岩流
    if (st.power < 0.5 && Math.random() < 0.3) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      vol.flows.push({ x: cx, y: topY, dir, len: 0, max: 30 + Math.random() * 60 });
    }
  }

  function volStep(ctx, w, h, dt) {
    vol.t += dt;
    const st = volStyle();
    if (Math.random() < 0.5 + st.power * 0.5) volSpawn(w, h);

    /* 背景与山体 */
    ctx.fillStyle = '#0b1420';
    ctx.fillRect(0, 0, w, h);
    // 天空微光
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0a1622'); sky.addColorStop(1, '#182433');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    const cx = w * 0.5, baseY = h * 0.78, topY = h * 0.38;
    // 山体
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.42, baseY);
    ctx.lineTo(cx - 22, topY);
    ctx.lineTo(cx + 22, topY);
    ctx.lineTo(cx + w * 0.42, baseY);
    ctx.closePath();
    ctx.fillStyle = '#2c2f38';
    ctx.fill();
    // 火口红光
    const glow = ctx.createRadialGradient(cx, topY, 2, cx, topY, 26 + st.power * 22);
    glow.addColorStop(0, 'rgba(255,120,40,0.9)');
    glow.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, topY, 30 + st.power * 22, 0, Math.PI * 2); ctx.fill();
    // 熔岩流（坡面暗红轨迹）
    for (const f of vol.flows) {
      f.len = Math.min(f.max, f.len + 0.6);
      f.x += f.dir * (1.2 - vol.v * 0.9);
      f.y += 0.55;
      ctx.strokeStyle = 'rgba(255,110,40,0.75)';
      ctx.lineWidth = 3.5 - vol.v;
      ctx.beginPath(); ctx.moveTo(cx + f.dir * 8, topY + 4);
      ctx.lineTo(f.x, Math.min(f.y, baseY)); ctx.stroke();
    }
    if (vol.flows.length > 30) vol.flows.splice(0, vol.flows.length - 30);

    /* 粒子 */
    for (let i = vol.parts.length - 1; i >= 0; i--) {
      const p = vol.parts[i];
      p.vy += 0.16;                     // 重力
      p.x += p.vx; p.y += p.vy;
      if (p.ash) { p.vy -= 0.06; p.vx += (Math.random() - 0.5) * 0.4; }  // 灰柱上飘
      p.life -= p.ash ? 0.006 : 0.014;
      if (p.life <= 0 || p.y > baseY + 4) { vol.parts.splice(i, 1); continue; }
      ctx.beginPath();
      if (p.ash) {
        ctx.fillStyle = `rgba(120,120,130,${0.35 * p.life})`;
        ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2);
      } else {
        ctx.fillStyle = `rgba(255,${110 + Math.floor(80 * p.life)},40,${Math.min(1, p.life)})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    /* 类型标签 */
    ctx.fillStyle = '#9FB6C9';
    ctx.font = '13px sans-serif';
    ctx.fillText('当前喷发类型：', 14, 24);
    ctx.fillStyle = '#FF9F45';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(st.name, 110, 24);
  }

  /* ================================================================
     板块运动沙盘（剖面视图）
     ================================================================ */
  const pl = {
    ax: 0.30, bx: 0.70,        // 两板块中心（0..1）
    av: 0, bv: 0,              // 速度（拖拽注入，随时间衰减）
    drag: null,                // 'A' | 'B' | null
    terrain: [],               // 中间地形高度场
    shake: 0,
  };

  function plateRelation() {
    const gap = pl.bx - pl.ax;
    const rel = (pl.av - pl.bv);       // >0: A 向 B 靠近（B 相对向左）→ 汇聚
    if (Math.abs(rel) < 0.0006) return { type: 'still', label: '静止 — 拖动两块板块试试' };
    if (rel > 0.0006 && gap > 0.08) return { type: 'conv', label: '汇聚边界 — 碰撞造山 / 俯冲海沟' };
    if (rel < -0.0006) return { type: 'div', label: '离散边界 — 张裂，裂谷 → 洋中脊' };
    return { type: 'conv', label: '汇聚边界 — 碰撞造山 / 俯冲海沟' };
  }

  function plateStep(ctx, w, h, dt) {
    /* 物理 */
    pl.ax += pl.av; pl.bx += pl.bv;
    pl.av *= 0.95; pl.bv *= 0.95;
    pl.ax = Math.max(0.06, Math.min(0.9, pl.ax));
    pl.bx = Math.max(0.1, Math.min(0.94, pl.bx));
    const rel = plateRelation();
    const gap = (pl.bx - pl.ax) * w;

    /* 背景 */
    ctx.fillStyle = '#0b1420';
    ctx.fillRect(0, 0, w, h);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0d1b2a'); sky.addColorStop(0.55, '#13293f');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);

    const mantleY = h * 0.72, baseY = h * 0.52;
    /* 地幔 */
    ctx.fillStyle = '#8a3c26';
    ctx.fillRect(0, mantleY, w, h - mantleY);
    // 对流箭头示意
    ctx.strokeStyle = 'rgba(255,180,120,0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const x = w * (0.2 + i * 0.3);
      ctx.beginPath(); ctx.arc(x, (mantleY + h) / 2, 22, 0, Math.PI * 2); ctx.stroke();
    }

    /* 边界效果 */
    const cxA = pl.ax * w, cxB = pl.bx * w;
    if (rel.type === 'conv') {
      // 中间隆起山脉
      const mid = (cxA + cxB) / 2;
      const rise = Math.max(0, 60 - Math.abs(gap - 70) * 0.35);
      ctx.fillStyle = '#9CCC5E';
      ctx.beginPath();
      ctx.moveTo(mid - 70, baseY);
      ctx.lineTo(mid - 24, baseY - rise);
      ctx.lineTo(mid + 24, baseY - rise);
      ctx.lineTo(mid + 70, baseY);
      ctx.closePath(); ctx.fill();
      // 火山三角
      ctx.fillStyle = '#F4643C';
      ctx.beginPath();
      ctx.moveTo(mid - 16, baseY - rise + 6);
      ctx.lineTo(mid, baseY - rise - 26);
      ctx.lineTo(mid + 16, baseY - rise + 6);
      ctx.closePath(); ctx.fill();
      // 地震波纹
      pl.shake = Math.max(pl.shake, 1.2);
    } else if (rel.type === 'div') {
      // 裂谷：中间下陷 + 岩浆上涌
      const mid = (cxA + cxB) / 2;
      const depth = Math.min(70, gap * 0.4);
      const mag = ctx.createLinearGradient(mid, baseY, mid, mantleY);
      mag.addColorStop(0, 'rgba(255,120,40,0.9)');
      mag.addColorStop(1, 'rgba(255,120,40,0.2)');
      ctx.fillStyle = mag;
      ctx.beginPath();
      ctx.moveTo(mid - gap / 2, baseY);
      ctx.lineTo(mid - gap / 6, baseY + depth * 0.4);
      ctx.lineTo(mid + gap / 6, baseY + depth * 0.4);
      ctx.lineTo(mid + gap / 2, baseY);
      ctx.closePath(); ctx.fill();
    } else if (pl.shake > 0) {
      pl.shake -= 0.05;
    }

    /* 板块 A / B */
    const drawPlate = (cx, color, label) => {
      ctx.fillStyle = color;
      ctx.fillRect(cx - 62, baseY, 124, mantleY - baseY - 8);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.strokeRect(cx - 62, baseY, 124, mantleY - baseY - 8);
      ctx.fillStyle = '#E8F1F8';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, cx, baseY + (mantleY - baseY) / 2);
      ctx.textAlign = 'left';
    };
    const shakeX = pl.shake > 0 ? (Math.random() - 0.5) * pl.shake * 3 : 0;
    ctx.save();
    ctx.translate(shakeX, 0);
    drawPlate(cxA, '#3a6ea8', '板块 A');
    drawPlate(cxB, '#3a8a5f', '板块 B');
    ctx.restore();

    /* 关系标签 */
    ctx.fillStyle = rel.type === 'conv' ? '#FF9F45' : rel.type === 'div' ? '#3DBE8B' : '#9FB6C9';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(rel.label, 14, 24);
    ctx.fillStyle = '#9FB6C9';
    ctx.font = '11px sans-serif';
    ctx.fillText('← 拖动板块 A / B →（同一块上左右拖）', 14, 42);
  }

  /* ================================================================
     面板控制
     ================================================================ */
  function open() {
    $('labModal').classList.remove('hidden');
    switchTab(rememberedTab);
    startRaf();
  }
  let rememberedTab = 'volcano';

  function switchTab(t) {
    tab = t; rememberedTab = t;
    document.querySelectorAll('.lab-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $('labVolcano').classList.toggle('hidden', t !== 'volcano');
    $('labPlate').classList.toggle('hidden', t !== 'plate');
  }

  function loop() {
    const cvName = tab === 'volcano' ? 'volcanoCanvas' : 'plateCanvas';
    const cv = $(cvName);
    if (!cv || $('labModal').classList.contains('hidden')) { stopRaf(); return; }
    const ctx = cv.getContext('2d');
    if (tab === 'volcano') volStep(ctx, cv.width, cv.height, 1/60);
    else plateStep(ctx, cv.width, cv.height, 1/60);
    volRaf = plateRaf = requestAnimationFrame(loop);
  }
  function startRaf() { stopRaf(); loop(); }
  function stopRaf() { cancelAnimationFrame(volRaf); cancelAnimationFrame(plateRaf); }

  function close() {
    $('labModal').classList.add('hidden');
    stopRaf();
  }

  function wire() {
    $('btnLab').addEventListener('click', open);
    $('labClose').addEventListener('click', close);
    document.querySelectorAll('.lab-tab').forEach(b => {
      b.addEventListener('click', () => { switchTab(b.dataset.tab); startRaf(); });
    });
    const vs = $('labVis'), gs = $('labGas');
    vs.addEventListener('input', () => vol.v = +vs.value / 100);
    gs.addEventListener('input', () => vol.g = +gs.value / 100);

    /* 板块拖拽（Pointer 事件，桌面/触屏通用） */
    const pc = $('plateCanvas');
    const hit = (x, w) => {
      const ax = pl.ax * w, bx = pl.bx * w;
      return Math.abs(x - ax) < 70 && Math.abs(x - bx) >= 70 ? 'A'
        : Math.abs(x - bx) < 70 ? 'B'
        : (x < (ax + bx) / 2 ? 'A' : 'B');
    };
    pc.addEventListener('pointerdown', (e) => {
      const r = pc.getBoundingClientRect();
      pl.drag = hit((e.clientX - r.left) * (pc.width / r.width), pc.width);
      pc.setPointerCapture(e.pointerId);
    });
    pc.addEventListener('pointermove', (e) => {
      if (!pl.drag) return;
      const r = pc.getBoundingClientRect();
      const x = (e.clientX - r.left) * (pc.width / r.width);
      const nx = Math.max(0.06, Math.min(0.94, x / pc.width));
      if (pl.drag === 'A') { pl.av = (nx - pl.ax) * 0.6; pl.ax = nx; }
      else { pl.bv = (nx - pl.bx) * 0.6; pl.bx = nx; }
    });
    const endDrag = () => { pl.drag = null; };
    pc.addEventListener('pointerup', endDrag);
    pc.addEventListener('pointercancel', endDrag);
  }

  return { wire, open, close };
})();
