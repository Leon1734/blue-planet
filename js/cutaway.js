/* ============================================================
   BluePlanet 地球剖析模式（M4）
   - 楔形开口的半剖地球：地壳/地幔/外核/内核四层碗壳 + 剖面弧板
   - 剥层滑块：剖面弧板沿法线方向逐层拉出（教科书爆炸图）
   - 点击圈层（弧板/碗壳）→ 圈层知识卡；图例芯片同样可点
   - 地震波演示：P 波贯穿全球（黄），S 波被液态外核阻挡（红）
     —— 正是 S 波阴影带发现外核为液态
   - 惰性构建：首次进入才创建几何体（file:// 冷启动友好）
   ============================================================ */

const BPCutaway = (() => {

  const WEDGE = Math.PI * 100 / 180;    // 楔形开口角（度→弧度）
  let group = null;                     // 剖切组（挂 scene 根，不随自转）
  let slabs = [];                       // 剖面弧板 [{ mesh, layer, n0, phi }]
  let pickables = [];                   // 可点选网格
  let waveSprites = null;               // [P波, S波]
  let wavePaths = null;                 // [P路径点列, S路径点列]
  let waveMats = [];
  let active = false;
  let built = false;
  let explode = 0;                      // 0..1 剥层系数
  let wavesOn = true;
  let t = 0;
  let selected = -1;

  /* ---------- 剖面贴图：一张同心圈层截面图（所有弧板共享） ---------- */
  function makeSectionTexture() {
    const S = 512, c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const cx = S / 2, pxPerUnit = (S / 2 - 4) / BPScene.R;
    // 从外到内画环带
    for (let i = BP_EARTH_LAYERS.length - 1; i >= 0; i--) {
      const L = BP_EARTH_LAYERS[i];
      const rOut = L.r1 * pxPerUnit, rIn = Math.max(0, L.r0 * pxPerUnit);
      const g = ctx.createRadialGradient(cx, cx, rIn, cx, cx, rOut);
      g.addColorStop(0, L.color);
      g.addColorStop(1, shade(L.color, -18));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cx, rOut, 0, Math.PI * 2);
      ctx.arc(cx, cx, rIn, 0, Math.PI * 2, true);
      ctx.fill();
      // 圈层边界白线
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cx, rOut, 0, Math.PI * 2); ctx.stroke();
    }
    // 地幔对流细纹（示意）
    ctx.strokeStyle = 'rgba(255,220,180,0.14)';
    ctx.lineWidth = 1.2;
    for (let r = 60; r < 96 * pxPerUnit; r += 14) {
      ctx.beginPath(); ctx.arc(cx, cx, r, 0, Math.PI * 2); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }

  /* 颜色加深/提亮小工具 */
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.max(0, (n >> 16) + amt));
    const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amt));
    const b = Math.min(255, Math.max(0, (n & 255) + amt));
    return `rgb(${r},${g},${b})`;
  }

  /* ---------- 环形扇板几何（角度区间 [-WEDGE/2, +WEDGE/2] 对称于 +X） ---------- */
  function slabShape(r0, r1, mid, half) {
    const s = new THREE.Shape();
    s.absarc(0, 0, r1, mid - half, mid + half, false);
    s.absarc(0, 0, Math.max(0.01, r0), mid + half, mid - half, true);
    return new THREE.ShapeGeometry(s, 48);
  }

  /* ---------- 构建 ---------- */
  function build() {
    group = new THREE.Group();
    const tex = makeSectionTexture();
    tex.repeat.set(1 / (BPScene.R * 2), 1 / (BPScene.R * 2));
    tex.offset.set(0.5, 0.5);

    const phiStart = WEDGE / 2;
    const phiLen = Math.PI * 2 - WEDGE;
    slabs = []; pickables = [];

    BP_EARTH_LAYERS.forEach((L, i) => {
      /* 碗壳：该层外表面（楔形缺口） */
      const bowl = new THREE.Mesh(
        new THREE.SphereGeometry(L.r1, 64, 48, phiStart, phiLen, 0, Math.PI),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(L.color), side: THREE.DoubleSide,
        })
      );
      bowl.userData.layer = i;
      group.add(bowl); pickables.push(bowl);

      /* 剖面弧板：两片，位于楔口两侧的切面上 */
      for (const phi of [phiStart, phiStart + phiLen]) {
        const geo = slabShape(L.r0, L.r1, 0, WEDGE / 2);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          map: tex, side: THREE.DoubleSide,
        }));
        // 把 XY 平面扇板立到含 Y 轴的切面上（局部 +X 对准切面方向）
        mesh.rotation.y = phi + Math.PI;
        mesh.userData.layer = i;
        mesh.userData.phi = phi;
        group.add(mesh); pickables.push(mesh); slabs.push(mesh);
      }
    });

    /* 地震波路径（取楔口正中切面，面向相机）
       P 波：沿直径贯穿全球；S 波：只能沿地幔弯曲行进，被液态外核挡住 */
    const a0 = 0;
    const deg = Math.PI / 180;
    const ptsP = [];
    for (let k = 0; k <= 40; k++) {
      const r = BPScene.R * (1 - 2 * k / 40);            // +R → -R 直径
      ptsP.push(new THREE.Vector3(Math.cos(a0) * r, Math.sin(a0) * r, 0));
    }
    /* S 波折线：地表 → 核幔边界附近 → 弯折回到地表 103°（S 波阴影带边界） */
    const sWay = [[100, 0], [88, 12], [70, 26], [58, 33], [66, 48], [82, 72], [100, 103]];
    const ptsS = sWay.map(([r, a]) => new THREE.Vector3(Math.cos(a * deg) * r, Math.sin(a * deg) * r, 0));
    wavePaths = [ptsP, ptsS];
    waveSprites = [];
    const waveColors = [0xffe07a, 0xff5a4d];
    for (let i = 0; i < 2; i++) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(wavePaths[i]),
        new THREE.LineBasicMaterial({ color: waveColors[i], transparent: true, opacity: 0.35 })
      );
      group.add(line);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: BPTextures.glowDotTex(), color: waveColors[i],
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      sp.scale.setScalar(i === 0 ? 5 : 4);
      group.add(sp);
      waveSprites.push(sp);
      waveMats.push(line.material);
    }

    sceneRootAdd();
    built = true;
  }

  /* 惰性拿光晕贴图：改用 BPTextures.glowDotTex() */

  function sceneRootAdd() {
    if (group.parent !== BPScene.scene) BPScene.scene.add(group);
  }

  /* ---------- 进入 / 退出 ---------- */
  let savedSpin = true;
  function enter() {
    if (!built) build();
    /* 朝向：楔口正对入场相机 */
    const cam = BPScene.camera.position;
    const lon = Math.atan2(-cam.z, cam.x) * 180 / Math.PI;   // 本项目经度约定
    group.rotation.y = (lon + 180) * Math.PI / 180;
    group.visible = true;
    active = true;
    savedSpin = BPScene.spin.auto;
    BPScene.earthGroup.visible = false;                       // 隐藏主地球（标记/图层一并隐藏）
    BPScene.flyTo(12, lon, 285, 1200);
    if (typeof cb.onSelect === 'function') cb.onSelect(-1);   // 清空圈层卡
  }
  function exit() {
    active = false;
    group.visible = false;
    BPScene.earthGroup.visible = true;
    BPScene.spin.auto = savedSpin;
    if (typeof cb.onSelect === 'function') cb.onSelect(-1);
  }

  /* ---------- 交互 ---------- */
  const cb = { onSelect: null };   // (layerIdx) -1=无
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pickAt(x, y) {
    if (!active || !built) return null;
    ndc.x = (x / window.innerWidth) * 2 - 1;
    ndc.y = -(y / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(ndc, BPScene.camera);
    const hits = raycaster.intersectObjects(pickables, false);
    return hits.length ? hits[0].object.userData.layer : null;
  }

  /* ---------- 逐帧 ---------- */
  function setExplode(v) {
    explode = Math.max(0, Math.min(1, v));
    if (!built) return;
    for (const m of slabs) {
      const i = m.userData.layer;
      const off = i * 16 * explode;
      const phi = m.userData.phi;
      const n = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));  // 切面法线
      m.position.copy(n.multiplyScalar(off));
    }
  }
  function setWaves(on) {
    wavesOn = on;
    if (!built) return;
    waveSprites.forEach(s => { s.visible = on; });
    waveMats.forEach(m => { m.visible = on; });
  }

  function update(dtSec) {
    if (!active || !built) return;
    t += dtSec;
    if (!wavesOn) return;
    /* P 波 8s 一轮贯穿全球；S 波同速出发、路径较短先到达 */
    const period = 8;
    const s = (t % period) / period;
    waveSprites[0].position.copy(sampleLine(wavePaths[0], Math.min(s, 1)));
    waveSprites[1].position.copy(sampleLine(wavePaths[1], Math.min(s * 1.25, 1)));
    waveSprites[1].visible = wavesOn && s < 0.9;
    waveSprites[0].visible = wavesOn;
  }

  function sampleLine(pts, s) {
    const segs = pts.length - 1;
    const f = s * segs;
    const i = Math.min(segs - 1, Math.floor(f));
    return pts[i].clone().lerp(pts[i + 1], f - i);
  }

  return {
    get isActive() { return active; },
    build, enter, exit, pickAt, update, setExplode, setWaves,
    set onSelect(fn) { cb.onSelect = fn; },
    get layers() { return BP_EARTH_LAYERS; },
  };
})();
