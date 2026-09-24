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

  /* 相机距离 → 允许显示的最大分级 */
  function maxLevel(camDist) {
    if (camDist > 780) return 1;
    if (camDist > 430) return 2;
    return 3;
  }

  /* 每帧更新：投影 + 背面剔除 + LOD */
  function update() {
    if (!container) return;
    if (!visible) { if (container.style.display !== 'none') container.style.display = 'none'; return; }
    if (container.style.display !== 'block') container.style.display = 'block';
    const cam = BPScene.camera;
    const camDist = cam.position.length();
    const maxZ = maxLevel(camDist);
    const W = window.innerWidth, H = window.innerHeight;

    for (const it of items) {
      const { data: L, el } = it;
      if (L.z > maxZ) { el.style.display = 'none'; continue; }
      const h = BPTextures.sampleHeight ? BPTextures.sampleHeight(L.lat, L.lon) : 0;
      _v.copy(BPScene.latLonToVec3(L.lat, L.lon, BPScene.R + BPScene.RELIEF * h + 0.6));
      const front = _v.clone().normalize().dot(
        cam.position.clone().sub(_v).normalize()) > 0.12;
      if (!front) { el.style.display = 'none'; continue; }
      _v.project(cam);
      const x = (_v.x * 0.5 + 0.5) * W;
      const y = (-_v.y * 0.5 + 0.5) * H;
      if (x < -40 || x > W + 40 || y < -20 || y > H + 20) { el.style.display = 'none'; continue; }
      el.style.display = 'block';
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    }
  }

  function setVisible(v) {
    visible = v;
    if (v && container) container.style.display = 'block';
  }

  return { build, update, setVisible };
})();
