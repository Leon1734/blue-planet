/* ============================================================
   BluePlanet 兴趣点标记层
   - 每个知识点：光柱（渐变透明）+ 底部脉冲扩散环 + 顶端亮豆
   - 射线拾取：悬停高亮 / 点击选中
   - 模块过滤：非当前模块淡化
   - 标记挂在地球组下，随自转同步移动
   ============================================================ */

const BPMarkers = (() => {

  const BEAM_H = 7.2;        // 光柱高度
  const BEAM_R_BOTTOM = 0.5;
  const BEAM_R_TOP = 0.12;
  const HIT_R = 5.0;         // 拾取球半径（覆盖光柱全长，便于点中）

  const markers = [];        // { poi, group, beam, ring, ring2, dot, hit, matRing, matRing2, phase }
  const byId = new Map();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let _tex = null;           // build() 传入的贴图缓存（亮豆光晕等）

  let hovered = null;
  let selected = null;
  let moduleFilter = null;   // null = 全部
  let layerVisible = true;

  const cb = { onHover: null, onSelect: null };

  /* 光柱纵向渐变贴图（白 → 透明，着色靠 material.color 相乘） */
  let beamTex = null;
  function makeBeamTex() {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 64, 0, 0);   // 底(不透明) → 顶(透明)
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 64);
    return new THREE.CanvasTexture(c);
  }

  /* ---------- 类型图标（知识点差异化：山/河/火山/海洋…） ---------- */
  const KIND_EMOJI = {
    mountain: '⛰️', volcano: '🌋', ocean: '🌊', river: '💧',
    climate: '☁️', geo: '⛏️', ice: '❄️', human: '🏗️',
  };
  const MODULE_KIND = {
    interior: 'geo', plates: 'geo', volcano: 'volcano', ocean: 'ocean',
    climate: 'climate', landform: 'mountain', polar: 'ice', human: 'human',
    earth: 'geo',
  };
  const kindSpriteCache = new Map();
  function kindSprite(colorHex, kind) {
    const key = colorHex + '|' + kind;
    if (kindSpriteCache.has(key)) return kindSpriteCache.get(key);
    const S = 72, c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    // 底部模块色光晕
    const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
    g.addColorStop(0, colorHex + 'ee');
    g.addColorStop(0.55, colorHex + '55');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    // 前景类型 emoji
    ctx.font = '30px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(KIND_EMOJI[kind] || '📍', S / 2, S / 2 + 2);
    const t = new THREE.CanvasTexture(c);
    kindSpriteCache.set(key, t);
    return t;
  }
  function poiKind(poi) {
    return poi.kind || MODULE_KIND[poi.module] || 'geo';
  }

  /* 打卡金环贴图（已访问知识点的角标） */
  let visitedTex = null;
  function makeVisitedTex() {
    if (visitedTex) return visitedTex;
    const S = 48, c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = '#FFD24A';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, 17, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#FFD24A';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✓', S / 2, S / 2 + 1);
    visitedTex = new THREE.CanvasTexture(c);
    return visitedTex;
  }

  /* 按模块共享的材质（beam/sprite），环材质每标记独立（脉冲动画） */
  const moduleMats = {};

  function getModuleMats(moduleId, colorHex) {
    if (!moduleMats[moduleId]) {
      moduleMats[moduleId] = {
        beam: new THREE.MeshBasicMaterial({
          map: beamTex, color: new THREE.Color(colorHex), transparent: true, opacity: 0.85,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }),
      };
    }
    return moduleMats[moduleId];
  }

  function build(textures) {
    _tex = textures;
    beamTex = makeBeamTex();
    const R = BPScene.R;

    BP_POIS.forEach((poi, i) => {
      const mod = BP_MODULES.find(m => m.id === poi.module);
      const colorHex = mod ? mod.color : '#ffffff';
      const mats = getModuleMats(poi.module, colorHex);
      const color = new THREE.Color(colorHex);

      const group = new THREE.Group();
      // 锚点贴合地形隆起后的地表（与 EARTH_VS 的 uRelief 一致）
      const h = _tex && _tex.sampleHeight ? _tex.sampleHeight(poi.lat, poi.lon) : 0;
      const anchorR = R + BPScene.RELIEF * h;
      const pos = BPScene.latLonToVec3(poi.lat, poi.lon, anchorR);
      group.position.copy(pos);
      // 局部 +Y 指向球面外法线
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize());

      /* 光柱（底端贴地） */
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(BEAM_R_TOP, BEAM_R_BOTTOM, BEAM_H, 8, 1, true),
        mats.beam
      );
      beam.position.y = BEAM_H / 2;
      group.add(beam);

      /* 脉冲扩散环（贴地表切面） */
      const matRing = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.8,
        side: THREE.DoubleSide, depthWrite: false,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.05, 40), matRing);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.12;
      group.add(ring);

      /* 选中态第二环（反相脉冲） */
      const matRing2 = matRing.clone();
      const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.05, 40), matRing2);
      ring2.rotation.x = -Math.PI / 2;
      ring2.position.y = 0.24;
      ring2.visible = false;
      group.add(ring2);

      /* 顶端类型图标（山/河/火山/海洋…，模块色光晕打底） */
      const dotMat = new THREE.SpriteMaterial({
        map: kindSprite(colorHex, poiKind(poi)), transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const dot = new THREE.Sprite(dotMat);
      dot.scale.setScalar(3.4);
      dot.position.y = BEAM_H + 0.3;
      group.add(dot);

      /* 打卡金环（已访问角标，右上侧） */
      const star = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeVisitedTex(), transparent: true, depthWrite: false,
      }));
      star.scale.setScalar(2.2);
      star.position.set(1.6, BEAM_H + 1.8, 0);
      star.visible = (typeof BPGame !== 'undefined')
        && BPGame.profile && BPGame.profile.visited.includes(poi.id);
      group.add(star);

      /* 拾取球（全透明但可见性为 true，保证 Raycaster 命中） */
      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(HIT_R, 8, 6),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
      hit.position.y = BEAM_H * 0.55;
      hit.userData.poiId = poi.id;
      group.add(hit);

      BPScene.earthGroup.add(group);
      const m = { poi, group, beam, ring, ring2, dot, star, hit, matRing, matRing2, phase: i * 0.37, baseScale: 1 };
      markers.push(m);
      byId.set(poi.id, m);
    });
  }

  /* 打卡后点亮金环 */
  function setVisited(id) {
    const m = byId.get(id);
    if (m) m.star.visible = true;
  }

  /* ---------- 射线拾取 ---------- */
  function raycastAt(clientX, clientY) {
    ndc.x = (clientX / window.innerWidth) * 2 - 1;
    ndc.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(ndc, BPScene.camera);
    const hits = raycaster.intersectObjects(markers.map(m => m.hit), false);
    if (hits.length) {
      const id = hits[0].object.userData.poiId;
      // 背面剔除：标记在世界坐标朝向相机才有效
      const m = byId.get(id);
      const wp = new THREE.Vector3();
      m.dot.getWorldPosition(wp);
      const toCam = BPScene.camera.position.clone().sub(wp).normalize();
      const normal = wp.clone().normalize();
      if (normal.dot(toCam) > 0.05) return id;
      return null;
    }
    return null;
  }

  /* ---------- 状态视觉 ---------- */
  function applyMarkerStyle(m) {
    const active = !moduleFilter || m.poi.module === moduleFilter;
    const isHover = hovered === m.poi.id;
    const isSel = selected === m.poi.id;
    const boost = isSel ? 1.6 : (isHover ? 1.25 : 1);

    m.beam.scale.set(boost, isSel ? 1.5 : 1, boost);
    m.dot.scale.setScalar(3.4 * boost);
    m.dot.material.opacity = (active ? 0.95 : 0.14);
    m.ring2.visible = isSel;
    m.matRing.opacity = (active ? 0.8 : 0.12) * boost;
    m.group.visible = layerVisible;
  }

  function refreshAll() {
    markers.forEach(applyMarkerStyle);
    // 光柱材质按模块共享，过滤时统一淡化
    for (const [mid, mats] of Object.entries(moduleMats)) {
      const active = !moduleFilter || mid === moduleFilter;
      mats.beam.opacity = active ? 0.85 : 0.10;
    }
  }

  /* ---------- 逐帧动画（脉冲环） ---------- */
  function animate(nowSec) {
    for (const m of markers) {
      const active = !moduleFilter || m.poi.module === moduleFilter;
      const speed = selected === m.poi.id ? 1.6 : 1;
      const t = ((nowSec * speed) + m.phase) % 1;
      const s = 1 + t * 2.4;
      m.ring.scale.set(s, s, 1);
      const base = active ? 0.75 : 0.1;
      m.matRing.opacity = base * Math.pow(1 - t, 1.6) + 0.05;
      if (m.ring2.visible) {
        const t2 = (nowSec * 1.6 + 0.5) % 1;
        const s2 = 1 + t2 * 2.0;
        m.ring2.scale.set(s2, s2, 1);
        m.matRing2.opacity = 0.9 * Math.pow(1 - t2, 1.6);
      }
    }
  }

  /* ---------- 标签屏幕投影 ---------- */
  const _v = new THREE.Vector3();
  function getScreenXY(poiId) {
    const m = byId.get(poiId);
    if (!m) return null;
    m.dot.getWorldPosition(_v);
    const toCam = BPScene.camera.position.clone().sub(_v).normalize();
    const front = _v.clone().normalize().dot(toCam) > 0.05;
    _v.project(BPScene.camera);
    return {
      x: (_v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-_v.y * 0.5 + 0.5) * window.innerHeight,
      front,
    };
  }

  return {
    build, raycastAt, animate, getScreenXY, refreshAll, setVisited,
    set onHover(fn) { cb.onHover = fn; },
    set onSelect(fn) { cb.onSelect = fn; },
    setHovered(id) {
      if (hovered === id) return;
      const prev = hovered; hovered = id;
      if (prev) applyMarkerStyle(byId.get(prev));
      if (id) applyMarkerStyle(byId.get(id));
      if (cb.onHover) cb.onHover(id);
    },
    setSelected(id) {
      const prev = selected; selected = id;
      if (prev) applyMarkerStyle(byId.get(prev));
      if (id) applyMarkerStyle(byId.get(id));
      if (cb.onSelect) cb.onSelect(id);
    },
    getSelected() { return selected; },
    getHovered() { return hovered; },
    setModuleFilter(moduleId) { moduleFilter = moduleId; refreshAll(); },
    getModuleFilter() { return moduleFilter; },
    setVisible(v) { layerVisible = v; markers.forEach(m => { m.group.visible = v; }); },
  };
})();
