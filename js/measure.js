/* ============================================================
   BluePlanet 地理工具箱（v23）
   - 点击地球两点：大圆航线 + Haversine 距离
   - 沿线采样地形贴图 → 高程剖面图（海平面线 + 峰/谷标注）
   - 零依赖，解析射线-球求交（不依赖 mesh raycast）
   ============================================================ */

const BPMeasure = (() => {

  let active = false;
  let pts = [];            // [{lat, lon}]
  let line = null;         // THREE.Line（挂 earthGroup，随自转）
  const pins = [];         // A/B 端点标记
  const R_M = 6371;        // 真实地球半径 km
  const PEAK_M = 8850;     // 高程贴图比值 → 米的标定上限（珠峰量级）

  /* ---------- 坐标换算（与 scene.js latLonToVec3 互逆） ---------- */
  function vecToLatLon(v) {
    const r = v.length();
    const lat = 90 - Math.acos(Math.min(1, Math.max(-1, v.y / r))) * 180 / Math.PI;
    let lon = Math.atan2(v.z, -v.x) * 180 / Math.PI - 180;
    if (lon < -180) lon += 360;
    return { lat, lon };
  }

  /* 屏幕点 → 地球表面 lat/lon（解析射线-球求交，忽略地形起伏） */
  function pickLatLon(cx, cy) {
    /* 节流/rAF 暂停时相机 matrixWorld 可能过期，先强制同步 */
    BPScene.camera.updateMatrixWorld();
    const ndc = new THREE.Vector2((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, BPScene.camera);
    const o = rc.ray.origin, d = rc.ray.direction;
    const b = o.dot(d);
    const c = o.lengthSq() - BPScene.R * BPScene.R;
    const disc = b * b - c;
    if (disc < 0) return null;                    // 没打中球
    const t = -b - Math.sqrt(disc);
    if (t < 0) return null;
    const world = o.clone().addScaledVector(d, t);
    const local = world.applyQuaternion(BPScene.earthGroup.quaternion.clone().invert());
    return vecToLatLon(local);
  }

  /* ---------- Haversine 大圆距离（km） ---------- */
  function haversine(a, b) {
    const toR = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
    return 2 * R_M * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  const fmtKm = (km) => km >= 100 ? Math.round(km).toLocaleString('zh-CN') : km.toFixed(1);

  /* ---------- 视觉元素 ---------- */
  function makePin(color) {
    const grp = new THREE.Group();
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 12, 10),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false }));
    grp.add(dot);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2, 2.5, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65,
        side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    grp.add(ring);
    grp.userData.ring = ring;
    BPScene.earthGroup.add(grp);
    return grp;
  }

  function placePin(pin, ll) {
    const h = BPTextures.sampleHeight(ll.lat, ll.lon);
    pin.position.copy(BPScene.latLonToVec3(ll.lat, ll.lon, BPScene.R + BPScene.RELIEF * h + 0.5));
    pin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pin.position.clone().normalize());
  }

  /* 大圆弧线：单位向量 nlerp（对跖点退化时返回 null），逐步采样高程抬升 */
  function buildArc(a, b) {
    const va = BPScene.latLonToVec3(a.lat, a.lon, 1).normalize();
    const vb = BPScene.latLonToVec3(b.lat, b.lon, 1).normalize();
    if (va.dot(vb) < -0.999) return null;
    const N = 96, pos = [];
    for (let i = 0; i <= N; i++) {
      const v = va.clone().lerp(vb, i / N).normalize();
      const ll = vecToLatLon(v);
      const h = BPTextures.sampleHeight(ll.lat, ll.lon);
      pos.push(BPScene.latLonToVec3(ll.lat, ll.lon, BPScene.R + BPScene.RELIEF * h + 0.8));
    }
    return pos;
  }

  /* ---------- 剖面图（Canvas 2D，DPR 自适应） ---------- */
  function drawProfile(a, b, km) {
    const cv = document.getElementById('msProfile');
    if (!cv) return;
    cv.classList.remove('hidden');
    const cssW = cv.parentElement.clientWidth > 420 ? 380 : cv.parentElement.clientWidth - 24;
    const cssH = 120;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = cssW * dpr; cv.height = cssH * dpr;
    cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const N = 72;
    const hs = [];
    const va = BPScene.latLonToVec3(a.lat, a.lon, 1).normalize();
    const vb = BPScene.latLonToVec3(b.lat, b.lon, 1).normalize();
    for (let i = 0; i <= N; i++) {
      const v = va.clone().lerp(vb, i / N).normalize();
      const ll = vecToLatLon(v);
      hs.push(BPTextures.sampleHeight(ll.lat, ll.lon));
    }
    const padL = 8, padR = 8, padT = 14, padB = 18;
    const W = cssW - padL - padR, H = cssH - padT - padB;
    const hMax = Math.max(...hs, 0.05);
    const X = (i) => padL + i / N * W;
    const Y = (h) => padT + (1 - h / hMax) * H;

    /* 海平面线 */
    ctx.strokeStyle = 'rgba(94,164,220,0.55)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(padL + W, Y(0)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#7FA6C9'; ctx.font = '9px sans-serif';
    ctx.fillText('海平面', padL + 2, Y(0) - 3);

    /* 剖面填充 */
    ctx.beginPath();
    hs.forEach((h, i) => i ? ctx.lineTo(X(i), Y(h)) : ctx.moveTo(X(i), Y(h)));
    ctx.strokeStyle = '#E8A24B'; ctx.lineWidth = 2; ctx.stroke();
    ctx.lineTo(X(N), Y(0)); ctx.lineTo(X(0), Y(0)); ctx.closePath();
    const grad = ctx.createLinearGradient(0, padT, 0, padT + H);
    grad.addColorStop(0, 'rgba(232,162,75,0.45)');
    grad.addColorStop(1, 'rgba(232,162,75,0.05)');
    ctx.fillStyle = grad; ctx.fill();

    /* 最高点标注 */
    const iMax = hs.indexOf(hMax);
    ctx.fillStyle = '#F2D5A0';
    ctx.fillText('▲ ' + Math.round(hMax * PEAK_M).toLocaleString('zh-CN') + ' m',
      Math.min(X(iMax), cssW - 62), Math.max(9, Y(hMax) - 4));

    /* 起终点标签 */
    ctx.fillStyle = '#9FB6C9'; ctx.font = '10px sans-serif';
    ctx.fillText('A', padL, cssH - 5);
    ctx.fillText('B', cssW - padR - 8, cssH - 5);
    ctx.fillText(Math.round(km).toLocaleString('zh-CN') + ' km', cssW / 2 - 26, cssH - 5);
  }

  /* ---------- 信息面板 ---------- */
  const $ = (id) => document.getElementById(id);
  function fmtLL(ll) {
    return `${Math.abs(ll.lat).toFixed(1)}°${ll.lat >= 0 ? 'N' : 'S'}, ${Math.abs(ll.lon).toFixed(1)}°${ll.lon >= 0 ? 'E' : 'W'}`;
  }
  function refreshPanel() {
    const ptsBox = $('msPts'), distBox = $('msDist');
    if (!ptsBox) return;
    if (!pts.length) {
      ptsBox.textContent = '在地球表面点击第一个测量点…';
      distBox.classList.add('hidden');
      return;
    }
    ptsBox.innerHTML = `<span class="ms-a">⬤ A</span> ${fmtLL(pts[0])}` +
      (pts[1] ? `<br><span class="ms-b">⬤ B</span> ${fmtLL(pts[1])}` : '<br><span class="ms-wait">再点击第二个测量点…</span>');
    if (pts.length >= 2) {
      const km = haversine(pts[0], pts[1]);
      const flyH = km / 880;
      distBox.classList.remove('hidden');
      distBox.innerHTML = `📏 直线距离 ≈ <b>${fmtKm(km)}</b> km` +
        ` <span class="ms-ctx">（直飞约 ${flyH < 1 ? flyH * 60 + ' 分钟' : flyH.toFixed(1) + ' 小时'}）</span>`;
      drawProfile(pts[0], pts[1], km);
      const note = $('msNote');
      if (note) note.classList.remove('hidden');
    }
  }

  /* ---------- 模式控制 ---------- */
  function applyCursor() {
    const cv = document.getElementById('scene');
    if (cv) cv.style.cursor = active ? 'crosshair' : '';
  }

  function addPoint(cx, cy) {
    const ll = pickLatLon(cx, cy);
    if (!ll) { toast('请点击地球表面'); return; }
    pts.push(ll);
    const pin = makePin(pts.length === 1 ? 0x53d769 : 0xff9d4d);
    placePin(pin, ll);
    pins.push(pin);
    if (pts.length >= 2) {
      const pos = buildArc(pts[0], pts[1]);
      if (pos) {
        const geo = new THREE.BufferGeometry().setFromPoints(pos);
        line = new THREE.Line(geo, new THREE.LineDashedMaterial({
          color: 0xffc069, dashSize: 4, gapSize: 2.6, transparent: true, opacity: 0.95 }));
        line.computeLineDistances();
        BPScene.earthGroup.add(line);
      } else {
        toast('两点几乎对跖，航线无定义，仅显示距离');
      }
    }
    refreshPanel();
  }

  function toast(msg) {
    if (typeof BPPanels !== 'undefined' && BPPanels.toast) BPPanels.toast(msg);
  }

  function clearAll() {
    pts = [];
    pins.forEach(p => BPScene.earthGroup.remove(p));
    pins.length = 0;
    if (line) { BPScene.earthGroup.remove(line); line = null; }
    const cv = $('msProfile');
    if (cv) cv.classList.add('hidden');
    const note = $('msNote');
    if (note) note.classList.add('hidden');
    refreshPanel();
  }

  function toggle(force) {
    active = typeof force === 'boolean' ? force : !active;
    document.getElementById('measurePanel')?.classList.toggle('hidden', !active);
    document.getElementById('btnMeasure')?.classList.toggle('on', active);
    /* 左下角冷知识卡与测量面板同位，测量时让位 */
    document.getElementById('factCard')?.classList.toggle('hidden', active);
    applyCursor();
    if (active) { clearAll(); toast('📐 测量模式：点击地球上的两点'); }
    return active;
  }

  /* 端点脉冲（主循环调用） */
  function update(nowSec) {
    if (!pins.length) return;
    const t = (nowSec % 1.6) / 1.6;
    pins.forEach(p => {
      p.userData.ring.scale.setScalar(1 + t * 1.5);
      p.userData.ring.material.opacity = 0.6 * (1 - t);
    });
  }

  return {
    toggle, update, clearAll,
    get isActive() { return active; },
    /* main.js 指针路由：测量模式下点画布即取点（返回 true 表示已消费） */
    onTap(cx, cy) {
      if (!active) return false;
      if (pts.length >= 2) clearAll();     // 第三次点击 = 重新开始
      addPoint(cx, cy);
      return true;
    },
  };
})();
