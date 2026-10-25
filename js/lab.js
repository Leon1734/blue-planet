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
     v29 大气三圈环流（北半球剖面：0° 赤道 → 90° 极地）
     ================================================================ */
  const atmo = { hover: null, t: 0 };
  /* 纬度 → 画布 x；环流圈用闭合折线，粒子沿线匀速巡游 */
  const AT_X0 = 70, AT_X1 = 590, AT_YLO = 282, AT_YHI = 96;
  const latX = (lat) => AT_X0 + (lat / 90) * (AT_X1 - AT_X0);
  function loopPath(a, b, dirRight) {
    /* 近地面 y=AT_YLO，高空 y=AT_YHI；dirRight=true 顺时针（地面风向右） */
    const xa = latX(a) + 8, xb = latX(b) - 8;
    return dirRight
      ? [[xa, AT_YLO], [xb, AT_YLO], [xb, AT_YHI], [xa, AT_YHI]]
      : [[xb, AT_YLO], [xa, AT_YLO], [xa, AT_YHI], [xb, AT_YHI]];
  }
  const ATMO_CELLS = [
    { id: 'hadley', name: '哈得来环流（热带）', color: '#F0954F', latA: 0, latB: 30, path: loopPath(0, 30, false),
      wind: '东北信风', windDir: -1,
      text: '赤道空气受热强烈上升（赤道低压带·ITCZ，雷雨倾盆），在高空流向副热带，在约 30° 下沉形成副热带高压——撒哈拉、阿拉伯、阿塔卡马等大沙漠恰好贴着 30° 纬线。近地面空气从 30° 流回赤道，被地转偏向力拧成东北信风，帆船时代"贸易风"由此得名。' },
    { id: 'ferrel', name: '费雷尔环流（中纬度）', color: '#5FBF8F', latA: 30, latB: 60, path: loopPath(30, 60, true),
      wind: '盛行西风', windDir: 1,
      text: '中纬度的"被动齿轮"：副热带高压的空气在近地面流向副极地低压（60°），被偏向成盛行西风——它送来温带气旋与连绵雨带，也送远洋货轮和跨大西洋航班"搭顺风"。方向与两侧两圈相反，天气因此最多变。' },
    { id: 'polar', name: '极地环流', color: '#6FA8DC', latA: 60, latB: 90, path: loopPath(60, 90, false),
      wind: '极地东风', windDir: -1,
      text: '极地空气冷而重，下沉形成极地高压；近地面空气从极点流向 60°，偏向成极地东风。冷气团在 60° 附近的副极地低压带与暖湿西风相遇，形成极锋——气旋风暴在这里排队东移，是北半球冬天雨雪的主要"生产线"。' },
  ];
  /* 粒子预置：每圈 26 颗，沿折线弧长参数化 */
  const atmoParts = [];
  for (const c of ATMO_CELLS) {
    const segs = [];
    let total = 0;
    for (let i = 0; i < c.path.length; i++) {
      const p1 = c.path[i], p2 = c.path[(i + 1) % c.path.length];
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      segs.push({ p1, p2, len, acc: total });
      total += len;
    }
    for (let i = 0; i < 26; i++) {
      atmoParts.push({ cell: c, segs, total, d: (i / 26) * total });
    }
  }
  function atmoPoint(part) {
    const d = ((part.d % part.total) + part.total) % part.total;
    const seg = part.segs.find(s => d <= s.acc + s.len) || part.segs[0];
    const t = (d - seg.acc) / seg.len;
    return [seg.p1[0] + (seg.p2[0] - seg.p1[0]) * t, seg.p1[1] + (seg.p2[1] - seg.p1[1]) * t];
  }

  function atmoStep(ctx, w, h, dt) {
    atmo.t += dt;
    const SPD = 62;   // 粒子巡游速度 px/s
    atmoParts.forEach(p => { p.d += SPD * dt; });

    /* 背景 */
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0a1826'); sky.addColorStop(1, '#12293c');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);

    /* 地表 */
    ctx.fillStyle = '#1d3a2a';
    ctx.fillRect(AT_X0 - 40, AT_YLO + 14, AT_X1 - AT_X0 + 80, h - AT_YLO - 14);
    ctx.fillStyle = '#9FB6C9'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    /* 纬度刻度 */
    [[0, '0° 赤道'], [30, '30°'], [60, '60°'], [90, '90° 极点']].forEach(([la, t]) => {
      const x = latX(la);
      ctx.strokeStyle = 'rgba(122,178,214,0.25)';
      ctx.beginPath(); ctx.moveTo(x, AT_YHI - 26); ctx.lineTo(x, AT_YLO + 14); ctx.stroke();
      ctx.fillStyle = '#7FA6C9';
      ctx.fillText(t, x, AT_YLO + 30);
    });

    /* 高空/近地面标线 */
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(122,178,214,0.3)';
    ctx.beginPath(); ctx.moveTo(AT_X0, AT_YHI); ctx.lineTo(AT_X1, AT_YHI); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#57708a'; ctx.textAlign = 'left';
    ctx.fillText('对流层高空', AT_X0 + 4, AT_YHI - 8);
    ctx.fillText('近地面', AT_X0 + 4, AT_YLO - 8);

    /* 三个环流圈：轨道 + 名称 */
    for (const c of ATMO_CELLS) {
      const on = atmo.hover === c.id;
      ctx.strokeStyle = on ? c.color : 'rgba(122,178,214,0.28)';
      ctx.lineWidth = on ? 2.5 : 1.2;
      ctx.beginPath();
      c.path.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.closePath(); ctx.stroke();
      /* 圈名 */
      ctx.fillStyle = on ? c.color : 'rgba(200,220,235,0.75)';
      ctx.font = `${on ? 'bold ' : ''}12px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(c.name, (latX(c.latA) + latX(c.latB)) / 2, (AT_YHI + AT_YLO) / 2 - 10);
      /* 地面风带箭头与名称 */
      const midX = (latX(c.latA) + latX(c.latB)) / 2;
      const ax = midX + c.windDir * 34, bx = midX - c.windDir * 34;
      ctx.strokeStyle = c.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ax, AT_YLO - 2); ctx.lineTo(bx, AT_YLO - 2); ctx.stroke();
      /* 箭头头部 */
      ctx.beginPath();
      ctx.moveTo(bx - c.windDir * 8, AT_YLO - 7);
      ctx.lineTo(bx, AT_YLO - 2);
      ctx.lineTo(bx - c.windDir * 8, AT_YLO + 3);
      ctx.closePath(); ctx.fillStyle = c.color; ctx.fill();
      ctx.fillStyle = c.color; ctx.font = 'bold 11.5px sans-serif';
      ctx.fillText(c.wind, midX, AT_YLO - 46);
    }

    /* 气压带标注（顶部交错两行，避免相邻重叠） */
    const belts = [
      [0, '赤道低压带·雷雨', '#F0C34F'], [30, '副热带高压·干燥', '#D98F4F'],
      [60, '副极地低压·风雨', '#6FB0D8'], [90, '极地高压·晴冷', '#9FC3E8'],
    ];
    belts.forEach(([la, t, col]) => {
      const x = Math.max(latX(la), Math.min(w - 74, latX(la)));
      const yName = (la === 0 || la === 60) ? 46 : 64;
      ctx.fillStyle = col; ctx.font = 'bold 11px sans-serif';
      ctx.fillText(t, x, yName);
      ctx.font = '10.5px sans-serif';
      ctx.fillText(la === 0 || la === 60 ? '↑ 上升' : '↓ 下沉', x, yName + 15);
    });

    /* 粒子 */
    for (const p of atmoParts) {
      const on = atmo.hover === p.cell.id;
      const [x, y] = atmoPoint(p);
      const bob = Math.sin(atmo.t * 3 + p.d * 0.1) * 1.5;
      ctx.fillStyle = p.cell.color + (on ? 'ff' : 'cc');
      ctx.beginPath(); ctx.arc(x, y + bob, on ? 3.2 : 2.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.textAlign = 'left';
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
    $('labAtmo').classList.toggle('hidden', t !== 'atmo');
  }

  function loop() {
    const cvName = tab === 'volcano' ? 'volcanoCanvas' : tab === 'plate' ? 'plateCanvas' : 'atmoCanvas';
    const cv = $(cvName);
    if (!cv || $('labModal').classList.contains('hidden')) { stopRaf(); return; }
    const ctx = cv.getContext('2d');
    if (tab === 'volcano') volStep(ctx, cv.width, cv.height, 1/60);
    else if (tab === 'plate') plateStep(ctx, cv.width, cv.height, 1/60);
    else atmoStep(ctx, cv.width, cv.height, 1/60);
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

    /* v29 大气环流：悬停到某一圈 → 讲解 */
    const ac = $('atmoCanvas');
    if (ac) {
      const infoOf = (x, w) => {
        const lat = ((x - AT_X0) / (AT_X1 - AT_X0)) * 90;
        return ATMO_CELLS.find(c => lat >= c.latA && lat <= c.latB) || null;
      };
      const setHover = (e) => {
        const r = ac.getBoundingClientRect();
        const x = (e.clientX - r.left) * (ac.width / r.width);
        const cell = infoOf(x, ac.width);
        atmo.hover = cell ? cell.id : null;
        ac.style.cursor = cell ? 'pointer' : 'default';
        const info = $('atmoInfo');
        if (info) {
          info.innerHTML = cell
            ? `<b style="color:${cell.color}">${cell.name}（${cell.latA}°~${cell.latB}°）</b>：${cell.text}`
            : '原理：太阳把赤道烤热、两极冷却，温差驱动出三个"传送带"——悬停到任意一圈查看详解。';
        }
      };
      ac.addEventListener('pointermove', setHover);
      ac.addEventListener('pointerleave', () => {
        atmo.hover = null;
        const info = $('atmoInfo');
        if (info) info.innerHTML = '原理：太阳把赤道烤热、两极冷却，温差驱动出三个"传送带"——悬停到任意一圈查看详解。';
      });
    }
  }

  return { wire, open, close };
})();
