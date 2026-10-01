/* ============================================================
   BluePlanet 动态地理图层（M3）
   - rivers  世界大河折线：自定义 shader 沿河道流动的亮脉冲
   - currents 表层洋流粒子：暖流橙红 / 寒流冰蓝，沿流路游动
   - winds   风带粒子：信风向西 / 西风向东，沿纬圈环流
   - climate 气候带色环：热带/温带/寒带半透明纬向色带 + 回归线极圈
   全部挂在 earthGroup 下随自转；update(dtSec) 驱动动画
   ============================================================ */

const BPLayers = (() => {

  const groups = {};        // key -> THREE.Group
  const riverMats = [];
  const currentPaths = [];  // { pts3, cum, total }
  const currentCount = [];  // 每条洋流的粒子数
  let currentPoints = null;
  let currentGeo = null;
  const windCircles = [];   // { lat, dir, speed }
  let windPoints = null;
  let windGeo = null;
  let _tex = null;          // 贴图缓存引用（粒子光晕）

  const COLORS = { river: 0x6ec6ff, warm: 0xff7a4d, cold: 0x4da6ff, wind: 0xdcefff };

  /* ---------- 工具：经纬折线 → 贴地三维点列（含高程抬升） ---------- */
  function groundLine(pts, lift = 0.3) {
    return pts.map(([lat, lon]) => {
      const h = BPTextures.sampleHeight ? BPTextures.sampleHeight(lat, lon) : 0;
      return BPScene.latLonToVec3(lat, lon, BPScene.R + BPScene.RELIEF * h + lift);
    });
  }

  /* ---------- 河流层：折线 + 流动脉冲 shader ---------- */
  function buildRivers(group) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(COLORS.river) },
      },
      vertexShader: `
        attribute float aT; varying float vT;
        void main() {
          vT = aT;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uColor; varying float vT;
        void main() {
          float f = fract(vT * 3.0 - uTime * 0.10);          // 沿下游移动的脉冲
          float pulse = smoothstep(0.18, 0.0, f);
          gl_FragColor = vec4(uColor, 0.38 + pulse * 0.62);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    riverMats.push(mat);

    for (const river of BP_RIVERS) {
      const pts3 = groundLine(river.pts, 0.35);
      // 逐段加密并计算沿程参数 0..1
      const pos = [], ts = [];
      let total = 0;
      const segs = [];
      for (let i = 1; i < pts3.length; i++) {
        const a = pts3[i - 1], b = pts3[i];
        const d = a.distanceTo(b);
        segs.push([a, b, total, d]);
        total += d;
      }
      for (const [a, b, t0, d] of segs) {
        const STEPS = Math.max(2, Math.round(d / 1.2));
        for (let k = 0; k < STEPS; k++) {
          const k1 = k / STEPS;
          pos.push(a.x + (b.x - a.x) * k1, a.y + (b.y - a.y) * k1, a.z + (b.z - a.z) * k1);
          ts.push((t0 + d * k1) / total);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aT', new THREE.Float32BufferAttribute(ts, 1));
      group.add(new THREE.Line(g, mat));
    }
  }

  /* ---------- 洋流层：粒子沿流路游动（v6：Catmull-Rom 平滑 + 速度按河宽渐变） ---------- */
  function samplePath(path, s) {
    const d = s * path.total;
    const cum = path.cum;
    let i = 1;
    while (i < cum.length && cum[i] < d) i++;
    if (i >= cum.length) return path.pts3[path.pts3.length - 1];
    const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1]);
    return path.pts3[i - 1].clone().lerp(path.pts3[i], t);
  }

  function buildCurrents(group) {
    const PER = 64;   // v6：每条流路粒子数 42→64
    for (const c of BP_CURRENTS) {
      let pts3;
      if (typeof THREE.CatmullRomCurve3 === 'function') {
        // 真实洋流路径平滑：折线 → Catmull-Rom 样条，粒子不再折角突兀
        const ctrl = groundLine(c.pts, 0.5);
        const curve = new THREE.CatmullRomCurve3(ctrl, false, 'catmullrom', 0.4);
        pts3 = curve.getPoints(Math.max(60, ctrl.length * 8));
      } else {
        pts3 = groundLine(c.pts, 0.5);
      }
      const cum = [0];
      for (let i = 1; i < pts3.length; i++) cum.push(cum[i - 1] + pts3[i].distanceTo(pts3[i - 1]));
      currentPaths.push({ pts3, cum, total: cum[cum.length - 1] });
      currentCount.push(PER);
    }
    const n = currentPaths.reduce((a, b) => a + b, 0);
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const offs = new Float32Array(n);
    const speeds = new Float32Array(n);
    let k = 0;
    const tmp = new THREE.Color();
    for (let p = 0; p < currentPaths.length; p++) {
      const warm = BP_CURRENTS[p].warm;
      tmp.set(warm ? COLORS.warm : COLORS.cold);
      for (let j = 0; j < PER; j++, k++) {
        col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
        offs[k] = j / PER;
        // 湾流/黑潮（前两条暖流）流速更快；粒子自身带随机扰动
        const base = BP_CURRENTS[p].warm && p < 2 ? 0.042 : 0.028;
        speeds[k] = base + Math.random() * 0.012;
      }
    }
    currentGeo = new THREE.BufferGeometry();
    currentGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    currentGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    currentPoints = new THREE.Points(currentGeo, new THREE.PointsMaterial({
      size: 2.6, map: _tex.glowDot, vertexColors: true,
      transparent: true, opacity: 0.95, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: false,
    }));
    currentPoints.userData.offs = offs;
    currentPoints.userData.speeds = speeds;
    group.add(currentPoints);
  }

  /* ---------- 风带层：粒子沿纬圈环流 ---------- */
  const WIND_PER = 34;   // 每条风带粒子数
  function buildWinds(group) {
    const n = BP_WINDS.length * WIND_PER;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const tmp = new THREE.Color(COLORS.wind);
    const angles = new Float32Array(n);
    let k = 0;
    for (const band of BP_WINDS) {
      for (let j = 0; j < WIND_PER; j++, k++) {
        col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
        angles[k] = (j / WIND_PER) * Math.PI * 2;
      }
      windCircles.push({ lat: band.lat, dir: band.dir, speed: band.speed });
    }
    windGeo = new THREE.BufferGeometry();
    windGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    windGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    windPoints = new THREE.Points(windGeo, new THREE.PointsMaterial({
      size: 2.2, map: _tex.glowDot, vertexColors: true,
      transparent: true, opacity: 0.7, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: false,
    }));
    windPoints.userData.angles = angles;
    group.add(windPoints);
  }

  /* ---------- 气候带色环 ---------- */
  function buildClimate() {
    const mat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vWN;
        void main() {
          vWN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vWN;
        void main() {
          float lat = degrees(asin(clamp(normalize(vWN).y, -1.0, 1.0)));
          float aLat = abs(lat);
          vec3 col; float a;
          if (aLat < 23.4) { col = vec3(1.0, 0.62, 0.27); a = 0.085; }        // 热带
          else if (aLat < 66.5) { col = vec3(0.24, 0.75, 0.55); a = 0.075; }  // 温带
          else { col = vec3(0.49, 0.72, 0.91); a = 0.11; }                    // 寒带
          // 回归线与极圈描边
          float d1 = abs(aLat - 23.4), d2 = abs(aLat - 66.5);
          float line = smoothstep(0.8, 0.0, min(d1, d2)) * 0.16;
          gl_FragColor = vec4(col, a + line);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(BPScene.R * 1.004, 64, 48), mat);
    groups.climate = new THREE.Group();
    groups.climate.add(shell);
  }

  /* ---------- 组装 ---------- */
  function build(textures) {
    _tex = textures;
    groups.rivers = new THREE.Group();
    groups.currents = new THREE.Group();
    groups.winds = new THREE.Group();
    buildRivers(groups.rivers);
    buildCurrents(groups.currents);
    buildWinds(groups.winds);
    buildClimate();
    BPScene.earthGroup.add(groups.rivers, groups.currents, groups.winds, groups.climate);
  }

  /* ---------- 逐帧 ---------- */
  let t = 0;
  function update(dtSec) {
    t += dtSec;
    for (const m of riverMats) m.uniforms.uTime.value = t;

    if (currentPoints && groups.currents.visible) {
      const pos = currentGeo.attributes.position.array;
      const offs = currentPoints.userData.offs, speeds = currentPoints.userData.speeds;
      let k = 0, idx = 0;
      for (let p = 0; p < currentPaths.length; p++) {
        const path = currentPaths[p];
        for (let j = 0; j < currentCount[p]; j++, k++) {
          const s = (offs[k] + t * speeds[k]) % 1;
          const v = samplePath(path, s);
          pos[idx++] = v.x; pos[idx++] = v.y; pos[idx++] = v.z;
        }
      }
      currentGeo.attributes.position.needsUpdate = true;
    }

    if (windPoints && groups.winds.visible) {
      const pos = windGeo.attributes.position.array;
      const angles = windPoints.userData.angles;
      const R = BPScene.R + 1.4;
      let idx = 0;
      for (let k = 0; k < angles.length; k++) {
        const band = windCircles[Math.floor(k / WIND_PER)];
        angles[k] = (angles[k] + dtSec * band.dir * band.speed * 0.05) % (Math.PI * 2);
        const latRad = band.lat * Math.PI / 180;
        const x = Math.cos(latRad) * Math.cos(angles[k]) * R;
        const y = Math.sin(latRad) * R;
        const z = Math.cos(latRad) * Math.sin(angles[k]) * R;
        pos[idx++] = x; pos[idx++] = y; pos[idx++] = z;
      }
      windGeo.attributes.position.needsUpdate = true;
    }
  }

  function setVisible(key, on) {
    if (groups[key]) groups[key].visible = on;
  }

  return { build, update, setVisible };
})();
