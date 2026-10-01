/* ============================================================
   BluePlanet 实时地震层（v6 / N1③）
   - 数据源：USGS GeoJSON Feed（4.5+ 一周，免费无 Key，CORS 开放）
   - 拉取成功：板块边界上叠加脉冲震圈（大小=震级，色=深度），点击看详情
   - 拉取失败（离线/被墙）：图层按钮显示"离线"角标，静默降级不影响其他功能
   - 挂 earthGroup 下随自转；30 分钟自动刷新
   ============================================================ */

const BPEarthquakes = (() => {

  const FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson';
  const REFRESH_MS = 30 * 60 * 1000;

  const cb = { onPick: null, onStatus: null };
  let group = null;
  let quakes = [];            // { id, mag, depth, place, time, lat, lon, mesh }
  let pickables = [];
  let status = 'loading';     // loading | live | offline
  let lastFetch = 0;
  let timer = null;

  const R = () => BPScene.R;

  /* 深度 → 颜色：浅源橙红 / 中源金黄 / 深源青蓝 */
  function depthColor(km) {
    if (km < 70) return 0xff5a4d;
    if (km < 300) return 0xffc14d;
    return 0x4dc6ff;
  }

  function build() {
    group = new THREE.Group();
    BPScene.earthGroup.add(group);
  }

  function latLon(lat, lon, lift) {
    return BPScene.latLonToVec3(lat, lon, R() + lift);
  }

  /* ---------- 拉取与渲染 ---------- */
  async function refresh() {
    if (!group) build();
    status = (status === 'live') ? 'live' : 'loading';
    emitStatus();
    try {
      const resp = await fetch(FEED, { cache: 'no-store' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const geo = await resp.json();
      render(geo.features || []);
      status = 'live';
      lastFetch = Date.now();
    } catch (e) {
      if (status !== 'live') status = 'offline';
      console.warn('[BluePlanet] 地震数据拉取失败（离线降级）:', e.message);
    }
    emitStatus();
    clearTimeout(timer);
    timer = setTimeout(refresh, REFRESH_MS);
  }

  function clearMeshes() {
    for (const q of quakes) {
      group.remove(q.mesh);
      q.mesh.geometry.dispose();
      q.mesh.material.dispose();
    }
    quakes = [];
    pickables = [];
  }

  function render(features) {
    clearMeshes();
    for (const f of features) {
      const [lon, lat, depth] = f.geometry.coordinates;
      const mag = f.properties.mag || 0;
      const size = (mag - 4) * 1.4 + 1.2;                 // M4.5≈1.9 … M7.5≈6.2
      const color = depthColor(depth);

      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(size, 12, 10),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.42,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      mesh.position.copy(latLon(lat, lon, 0.6 + size * 0.2));
      mesh.userData.eq = {
        mag, depth,
        place: f.properties.place || '未知位置',
        time: f.properties.time,
        url: f.properties.url,
        lat, lon,
      };
      group.add(mesh);
      pickables.push(mesh);
      quakes.push({ id: f.id, mag, depth, lat, lon, mesh });
    }
  }

  /* ---------- 交互：射线拾取 → 详情卡 ---------- */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pickAt(x, y) {
    if (status !== 'live' || !group || !group.visible) return null;
    ndc.x = (x / window.innerWidth) * 2 - 1;
    ndc.y = -(y / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(ndc, BPScene.camera);
    const hits = raycaster.intersectObjects(pickables, false);
    if (!hits.length) return null;
    const wp = hits[0].object.getWorldPosition(new THREE.Vector3());
    const toCam = BPScene.camera.position.clone().sub(wp).normalize();
    if (wp.clone().normalize().dot(toCam) < 0.05) return null;   // 背面剔除
    return hits[0].object.userData.eq;
  }

  function fmtTime(ms) {
    const d = new Date(ms);
    return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
  }

  /* ---------- 逐帧脉冲 ---------- */
  function update(nowSec) {
    if (status !== 'live' || !group || !group.visible) return;
    for (const q of quakes) {
      const t = (nowSec * 0.9 + (q.mag * 13.7) % 1) % 1;
      const m = q.mesh;
      m.scale.setScalar(0.85 + Math.sin(t * Math.PI) * 0.55);
      m.material.opacity = 0.28 + Math.sin(t * Math.PI) * 0.3;
    }
  }

  function setVisible(v) {
    if (!group) build();
    group.visible = v;
  }

  function emitStatus() {
    if (cb.onStatus) cb.onStatus(status, quakes.length);
  }

  function init() {
    refresh();
  }

  return {
    init, refresh, update, pickAt, setVisible, fmtTime,
    set onPick(fn) { cb.onPick = fn; },
    set onStatus(fn) { cb.onStatus = fn; },
    get status() { return status; },
    get count() { return quakes.length; },
    get lastFetch() { return lastFetch; },
  };
})();
