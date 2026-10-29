/* ============================================================
   BluePlanet 常显地名标注层
   - 山川河流湖海名称直接写在球面上（DOM 元素，随帧投影）
   - 背面自动隐藏；按相机距离分级显示（远观只看地标，放大看细节）
   - 锚点高度贴合地形隆起（sampleHeight）
   ============================================================ */

const BPLabels = (() => {

  const items = [];        // { label, lat, lon, kind, z, el }
  const _v = new THREE.Vector3();
  let container = null;
  let visible = true;

  /* 各类型的显示前缀与颜色（与 css 中 .bp-label-<kind> 配合） */
  const KIND_STYLE = {
    peak:    { pre: '▲', color: '#FFD08A' },
    range:   { pre: '⛰', color: '#E8C79A' },
    river:   { pre: '≈', color: '#8FC7F2' },
    desert:  { pre: '▪', color: '#E8C07A' },
    plateau: { pre: '◆', color: '#C9D6A3' },
    plain:   { pre: '·', color: '#B8CE9E' },
    trench:  { pre: '▼', color: '#7EB8E8' },
    sea:     { pre: '',   color: '#9FD3F0' },
    island:  { pre: '',   color: '#AFDFC4' },
    canal:   { pre: '',   color: '#F0C98F' },
    pole:    { pre: '❄', color: '#BFE3FF' },
    /* v39 洋流：暖流暖橙 / 寒流冰蓝（与粒子层配色一致） */
    currentw: { pre: '',  color: '#FFC9A0' },
    currentc: { pre: '',  color: '#A5DCF5' },
  };

  function build() {
    container = document.getElementById('labelLayer');
    if (!container) return;
    BP_LABELS.forEach((L) => {
      const el = document.createElement('div');
      const style = KIND_STYLE[L.k] || KIND_STYLE.sea;
      el.className = `bp-label bp-label-${L.k} bp-label-z${L.z}`;
      el.textContent = (style.pre ? style.pre + ' ' : '') + L.t;
      el.style.color = style.color;
      container.appendChild(el);
      items.push({ data: L, el });
    });
  }

  /* 相机距离 → 允许显示的最大分级（移动端降密：小屏最多显示到 z2） */
  function maxLevel(camDist) {
    const mobile = window.innerWidth < 700;
    if (camDist > 780) return 1;
    if (camDist > 430) return 2;
    return mobile ? 2 : 3;
  }

  /* v18 性能：脏检查 + 限帧 + 样式去重
     - 相机与地球姿态未变化时直接跳过（静止画面零开销）
     - 最多 ~30fps 更新（标签无需 60fps）
     - 仅位置实际变化 >0.5px 才写 style（避免触发重排）*/
  let lastT = 0, lastUpdate = 0;
  let lastCamQ = null, lastCamPos = null, lastEarthQ = null;

  function poseChanged() {
    const cam = BPScene.camera;
    if (!lastCamQ) return true;
    if (cam.position.distanceToSquared(lastCamPos) > 0.01) return true;
    if (lastCamQ.angleTo(cam.quaternion) > 0.0004) return true;
    if (lastEarthQ.angleTo(BPScene.earthGroup.quaternion) > 0.0002) return true;
    return false;
  }

  function update(force) {
    if (!container) return;
    if (!visible) { if (container.style.display !== 'none') container.style.display = 'none'; return; }
    if (container.style.display !== 'block') container.style.display = 'block';
    const now = performance.now();
    /* 限帧：约 30fps；但姿态变化时也要及时（用 28ms 门限） */
    if (!force && now - lastUpdate < 28) return;
    if (!force && !poseChanged()) return;
    lastUpdate = now;
    const cam = BPScene.camera;
    const camDist = cam.position.length();
    const maxZ = maxLevel(camDist);
    const W = window.innerWidth, H = window.innerHeight;
    lastCamQ = cam.quaternion.clone();
    lastCamPos = cam.position.clone();
    lastEarthQ = BPScene.earthGroup.quaternion.clone();

    for (const it of items) {
      const { data: L, el } = it;
      if (L.z > maxZ) {
        if (el._shown !== false) { el.style.display = 'none'; el._shown = false; }
        continue;
      }
      const h = BPTextures.sampleHeight ? BPTextures.sampleHeight(L.lat, L.lon) : 0;
      _v.copy(BPScene.latLonToVec3(L.lat, L.lon, BPScene.R + BPScene.RELIEF * h + 0.6));
      /* 关键：应用地球自转矩阵，让标签随球体一起转（此前遗漏导致自转时标签漂移） */
      _v.applyQuaternion(BPScene.earthGroup.quaternion);
      const front = _v.clone().normalize().dot(
        cam.position.clone().sub(_v).normalize()) > 0.12;
      if (!front) {
        if (el._shown !== false) { el.style.display = 'none'; el._shown = false; }
        continue;
      }
      _v.project(cam);
      const x = (_v.x * 0.5 + 0.5) * W;
      const y = (-_v.y * 0.5 + 0.5) * H;
      if (x < -40 || x > W + 40 || y < -20 || y > H + 20) {
        if (el._shown !== false) { el.style.display = 'none'; el._shown = false; }
        continue;
      }
      if (el._shown !== true) { el.style.display = 'block'; el._shown = true; }
      /* 位置去重：变化小于 0.5px 不写样式 */
      if (el._lx === undefined || Math.abs(x - el._lx) > 0.5 || Math.abs(y - el._ly) > 0.5) {
        el._lx = x; el._ly = y;
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      }
    }
  }

  function setVisible(v) {
    visible = v;
    if (v && container) container.style.display = 'block';
    lastCamQ = null;   // v18：重新可见时强制刷新位置
  }

  return { build, update, setVisible };
})();
