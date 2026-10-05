/* ============================================================
   BluePlanet 深时古地球（v6 / N2）
   - 切换纪元：大陆多边形球面重建（贴地表三角扇填充），纪元间淡入淡出
   - 隐藏主地球贴图，显示"古地球色球"（按纪元主题色+海洋渐变）
   - 纪元知识卡：含氧量/CO₂/海平面/生命概况
   - 与「地球 24 小时」胶囊条联动（main.js 接线）
   ============================================================ */

const BPDeepTime = (() => {

  const cb = { onEpoch: null };
  let active = false;
  let current = 'present';
  let group = null;         // 深时组（含古地球球+大陆 mesh）
  let globeMat = null;
  let contGroup = null;
  let contGroups = [];   // 历史纪元大陆组（交叉淡化用）
  let savedSpin = true;

  const R = () => BPScene.R;

  function latLon(lat, lon, r) { return BPScene.latLonToVec3(lat, lon, r); }

  function build() {
    group = new THREE.Group();
    group.visible = false;
    /* 古地球基球：纪元主题色海洋（雾面，无贴图） */
    globeMat = new THREE.MeshBasicMaterial({ color: 0x1a4a6a });
    const globe = new THREE.Mesh(new THREE.SphereGeometry(R() * 0.998, 64, 48), globeMat);
    group.add(globe);
    /* 大陆容器 */
    contGroup = new THREE.Group();
    group.add(contGroup);
    /* 大气轮廓（借主大气壳观感） */
    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(R() * 1.05, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0x4d9fff, transparent: true, opacity: 0.12, side: THREE.BackSide })
    );
    group.add(rim);
    BPScene.scene.add(group);
  }

  /* 多边形质心 */
  function centroidOf(poly) {
    let la = 0, lo = 0;
    poly.forEach(([a, o]) => { la += a; lo += o; });
    return [la / poly.length, lo / poly.length];
  }

  /* 大陆多边形 → 球面填充（canvas 2D 栅格化：fill 处理自交/环绕，逐像素贴球面） */
  function buildContinent(poly, colorHex, op) {
    const color = new THREE.Color(colorHex);
    const rr = R() * 1.006;
    const group = new THREE.Group();
    let latMin = 90, latMax = -90, lonMin = 180, lonMax = -180;
    for (const [la, lo] of poly) {
      latMin = Math.min(latMin, la); latMax = Math.max(latMax, la);
      lonMin = Math.min(lonMin, lo); lonMax = Math.max(lonMax, lo);
    }
    let shifted = poly;
    if (lonMax - lonMin > 180) {
      shifted = poly.map(([la, lo]) => [la, lo < 0 ? lo + 360 : lo]);
      lonMin = 1e9; lonMax = -1e9;
      for (const [la, lo] of shifted) {
        lonMin = Math.min(lonMin, lo); lonMax = Math.max(lonMax, lo);
      }
    }
    const STEP = 4, CELL = 3;
    const W = Math.max(2, Math.round((lonMax - lonMin) * CELL));
    const H = Math.max(2, Math.round((latMax - latMin) * CELL));
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    shifted.forEach(([la, lo], i) => {
      const x = (lo - lonMin) * CELL, y = (latMax - la) * CELL;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    const mask = ctx.getImageData(0, 0, W, H).data;
    const has = (la, lo) => {
      const x = Math.min(W - 1, Math.round((lo - lonMin) * CELL));
      const y = Math.min(H - 1, Math.round((latMax - la) * CELL));
      return mask[(y * W + x) * 4 + 3] > 128;
    };
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false,
    });
    for (let la = latMin; la < latMax; la += STEP) {
      for (let lo = lonMin; lo < lonMax; lo += STEP) {
        let hit = 0;
        for (const [dla, dlo] of [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]]) {
          if (has(la + dla * STEP, lo + dlo * STEP)) hit++;
        }
        if (hit < 2) continue;
        const g = new THREE.BufferGeometry();
        const pos = [];
        for (const [dla, dlo] of [[0, 0], [STEP, 0], [STEP, STEP], [0, 0], [STEP, STEP], [0, STEP]]) {
          const v = latLon(la + dla, lo + dlo, rr);
          pos.push(v.x, v.y, v.z);
        }
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        group.add(new THREE.Mesh(g, mat));
      }
    }
    const edge = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        shifted.map(([la, lo]) => latLon(la, lo > 180 ? lo - 360 : lo, R() * 1.012))
      ),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 })
    );
    group.add(edge);
    group.userData.centroid = centroidOf(poly);
    group.userData.origPoly = poly;
    group.userData.fromPos = group.position.clone();
    group.userData.toPos = group.position.clone();
    return group;
  }



  /* ---------- 纪元切换（交叉淡化 + v13 大陆沿球面漂移） ---------- */
  let fadeList = [];   // { obj, mats, from, to, dur, t, onDone }
  let driftList = [];  // v13: { cont, q } —— 大陆从旧纪元位置滑向新位置
  let drift = null;    // { t, dur }
  function setEpoch(id, animateMs) {
    const idx = BP_DEEPTIME.findIndex(e => e.id === id);
    if (idx < 0) return;
    const epoch = BP_DEEPTIME[idx];
    current = id;
    if (!group) build();

    const newGroup = buildEpochGroup(epoch);
    newGroup.userData.epochId = epoch.id;
    group.add(newGroup);
    contGroups.push(newGroup);
    const oldGroup = contGroup;
    contGroup = newGroup;

    const dur = animateMs || 0;
    if (dur && oldGroup && oldGroup !== newGroup) {
      /* v13 漂移：新旧纪元大陆按质心就近配对，
         新大陆起始姿态 = 从旧质心转到新质心的旋转（即"站在旧位置"），
         随时间 slerp 回恒等姿态 —— 视觉上大陆沿球面滑过来 */
      const prevEpoch = BP_DEEPTIME.find(e => e.id === oldGroup.userData.epochId) || null;
      const matches = matchContinents(prevEpoch, newGroup);
      setGroupOpacity(newGroup, 0);
      fadeList.push({ g: newGroup, from: 0, to: 0.94, t: 0, dur });
      fadeList.push({ g: oldGroup, from: 0.94, to: 0, t: 0, dur, remove: true });
      driftList = [];
      if (matches.length) {
        for (const m of matches) {
          const vFrom = latLon(m.from[0], m.from[1], 1).normalize();
          const vTo = latLon(m.to[0], m.to[1], 1).normalize();
          if (vFrom.dot(vTo) < -0.999) continue;   // 对跖点不定义唯一旋转，只淡化
          const q = new THREE.Quaternion().setFromUnitVectors(vFrom, vTo);
          m.cont.quaternion.copy(q);               // 起始：旧位置
          driftList.push({ cont: m.cont, q });
        }
        drift = { t: 0, dur: Math.max(dur, 2400) };
      }
    }

    globeMat.color.set(mixOcean(epoch.color));
    if (cb.onEpoch) cb.onEpoch(epoch);
  }

  /* 新纪元每个大陆组 ↔ 旧纪元最近质心配对（阈值 60°，避免乱配） */
  function matchContinents(prevEpoch, newGroup) {
    const out = [];
    if (!prevEpoch || !prevEpoch.continents) return out;
    const prevC = prevEpoch.continents.map(p => centroidOf(p));
    for (const cont of newGroup.children) {
      if (!cont.isGroup || !cont.userData.centroid) continue;
      const c = cont.userData.centroid;
      let best = null, bestD = 1e9;
      for (const pc of prevC) {
        const d = Math.hypot(pc[0] - c[0], pc[1] - c[1]);
        if (d < bestD) { bestD = d; best = pc; }
      }
      if (best && bestD < 60) out.push({ cont, to: c, from: best });
    }
    return out;
  }

  function setGroupOpacity(g, op) {
    g.children.forEach(m => {
      if (m.isMesh) { m.material.transparent = true; m.material.opacity = op; }
      if (m.isLine) { m.material.transparent = true; m.material.opacity = op * 0.42; }
    });
  }

  function stepFades(dtMs) {
    /* v13 漂移驱动：姿态从 q（旧位置）slerp 回恒等（新位置） */
    if (drift) {
      drift.t += dtMs;
      const k = Math.min(1, drift.t / drift.dur);
      const e = k * k * (3 - 2 * k);
      for (const d of driftList) {
        d.cont.quaternion.set(0, 0, 0, 1).slerp(d.q, 1 - e);
      }
      if (k >= 1) { drift = null; driftList = []; }
    }
    if (!fadeList.length) return;
    for (let i = fadeList.length - 1; i >= 0; i--) {
      const f = fadeList[i];
      f.t += dtMs;
      const k = Math.min(1, f.t / f.dur);
      setGroupOpacity(f.g, f.from + (f.to - f.from) * k);
      if (k >= 1) {
        if (f.remove && f.g !== contGroup) group.remove(f.g);
        fadeList.splice(i, 1);
      }
    }
  }

  /* 纪元主题色 → 海洋底色（压暗调蓝） */
  function mixOcean(hex) {
    const c = new THREE.Color(hex);
    return new THREE.Color(0x0d2a40).lerp(c, 0.12).getHex();
  }

  /* 构建一个纪元的大陆组（含描边与质心元数据） */
  function buildEpochGroup(epoch) {
    const g = new THREE.Group();
    g.userData.epochId = epoch.id;
    for (const poly of epoch.continents) {
      const cont = buildContinent(poly, epoch.color, 0.94);
      g.add(cont);
    }
    return g;
  }

  /* 纪元主题色 → 海洋底色（压暗调蓝） */
  function mixOcean(hex) {
    const c = new THREE.Color(hex);
    return new THREE.Color(0x0d2a40).lerp(c, 0.12).getHex();
  }

  /* ---------- 进入 / 退出 ---------- */
  function enter(epochId) {
    if (!group) build();
    active = true;
    savedSpin = BPScene.spin.auto;
    BPScene.earthGroup.visible = false;   // 隐藏现代地球
    group.visible = true;
    BPLabels.setVisible(false);
    BPLayers.setVisible('rivers', false);
    BPLayers.setVisible('currents', false);
    BPLayers.setVisible('climate', false);
    setEpoch(epochId || current || 'present', 1000);
    BPScene.flyTo(15, 20, 330, 1200);   // 正对盘古中心（大西洋侧）
  }

  function exit() {
    active = false;
    if (group) group.visible = false;
    BPScene.earthGroup.visible = true;
    BPScene.spin.auto = savedSpin;
    BPLabels.setVisible(true);
  }

  /* ---------- 逐帧：呼吸 + 淡化过渡驱动 ---------- */
  function update(dtSec) {
    if (!active || !group || !group.visible) return;
    stepFades(dtSec * 1000);
    /* 大陆微微发光呼吸 */
    for (const cont of contGroup.children) {
      if (!cont.isGroup) continue;
      const mat = cont.children[0] && cont.children[0].material;
      if (mat && mat.transparent && mat.opacity > 0.2) {
        mat.opacity = Math.min(mat.opacity, 0.9) + Math.sin(performance.now() / 900) * 0.03;
      }
    }
  }

  /* ---------- 交互拾取（纪元卡由 UI 面板承担，这里不做球面拾取） ---------- */

  return {
    enter, exit, setEpoch, update,
    get isActive() { return active; },
    get currentEpoch() { return current; },
    set onEpoch(fn) { cb.onEpoch = fn; },
    get epochs() { return BP_DEEPTIME; },
  };
})();
