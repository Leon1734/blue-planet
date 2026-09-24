/* ============================================================
   BluePlanet 3D 场景层
   - 地球：昼夜双贴图 + 真实 UTC 晨昏线着色器（夜面城市灯光）
   - 云层：独立漂移的半透明壳
   - 大气辉光：BackSide 菲涅尔外壳（昼侧更亮）
   - 星空：三层粒子（暗星 / 亮星 / 彩色星芒）
   - 板块边界：data.js 折线 → 发光弧线（示意）
   - 虚拟时钟：支持 1×/600×/3600× 快进，晨昏线随之扫动
   ============================================================ */

const BPScene = (() => {

  const R = 100;                 // 地球半径（场景单位）
  const RELIEF = 2.4;            // 地形隆起强度（与 EARTH_VS 的 uRelief 一致，标记锚点共用）
  const SPIN_RATE = 0.016;       // 自转角速度 rad/s（约 6.5 分钟一圈）
  const CLOUD_DRIFT = 0.0035;    // 云层相对地表的漂移 rad/s

  let renderer, scene, camera, controls;
  let earthGroup, earthMat, cloudMesh, plateGroup;
  let starLayers = [];

  /* ---------- 虚拟时钟（晨昏线快进用） ---------- */
  const time = { offsetMs: 0, speed: 1 };
  const timeApi = {
    now() { return Date.now() + time.offsetMs; },
    advance(dtSec) {
      if (time.speed > 1) time.offsetMs += dtSec * (time.speed - 1) * 1000;
    },
    setSpeed(s) { time.speed = s; },
    getSpeed() { return time.speed; },
    reset() { time.offsetMs = 0; time.speed = 1; },
    isSim() { return time.speed > 1 || Math.abs(time.offsetMs) > 60000; },
  };

  /* 太阳方向（世界空间单位向量）——各材质共享同一实例 */
  const sunDir = new THREE.Vector3(1, 0, 0);

  /* ---------- 经纬度 → 球面坐标 ----------
     与 THREE.SphereGeometry 默认 UV 对齐：贴图左缘 = 180°W 日界线 */
  function latLonToVec3(lat, lon, r) {
    const phi = (90 - lat) * Math.PI / 180;      // 极角
    const theta = (lon + 180) * Math.PI / 180;   // 方位角
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
  }

  /* ---------- 太阳直射点（含赤纬 + 均时差近似） ---------- */
  function computeSunDir(ms) {
    const d = new Date(ms);
    const yearStart = Date.UTC(d.getUTCFullYear(), 0, 0);
    const doy = (ms - yearStart) / 86400000;                    // 年内第几天（含小数）
    const decl = 23.44 * Math.sin(2 * Math.PI * (doy - 81) / 365); // 太阳赤纬（度）
    const B = 2 * Math.PI * (doy - 81) / 364;
    const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // 均时差（分钟）
    const utcH = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    const subLon = -15 * (utcH - 12 + eot / 60);                // 直射经度（东正）
    return latLonToVec3(decl, subLon, 1);
  }

  /* ---------- 着色器 ---------- */
  const COMMON_VS = `
    varying vec2 vUv; varying vec3 vWN;
    void main() {
      vUv = uv;
      vWN = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;

  /* 地球顶点着色器：高程贴图顶点位移（山脉隆起，海洋保持球面） */
  const EARTH_VS = `
    uniform sampler2D heightMap; uniform float uRelief;
    varying vec2 vUv; varying vec3 vWN; varying vec3 vVN; varying vec3 vVP;
    void main() {
      vUv = uv;
      vec3 nrm = normalize(position);
      float h = texture2D(heightMap, uv).r;
      vec3 displaced = position + nrm * (uRelief * h);
      vWN = normalize(mat3(modelMatrix) * nrm);
      vVN = normalize(normalMatrix * nrm);
      vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
      vVP = -mv.xyz;
      gl_Position = projectionMatrix * mv;
    }`;

  /* 地球：全昼"图上科普"风格 + 高程凹凸着色（相机相对光照的图集式山体阴影） */
  const EARTH_FS = `
    precision highp float;
    uniform sampler2D dayMap; uniform sampler2D nightMap;
    uniform sampler2D heightMap; uniform float uBump;
    uniform vec3 sunDir;
    varying vec2 vUv; varying vec3 vWN; varying vec3 vVN; varying vec3 vVP;

    vec2 dHdxy_fwd() {
      vec2 dSTdx = dFdx(vUv), dSTdy = dFdy(vUv);
      float Hll = uBump * texture2D(heightMap, vUv).x;
      float dBx = uBump * texture2D(heightMap, vUv + dSTdx).x - Hll;
      float dBy = uBump * texture2D(heightMap, vUv + dSTdy).x - Hll;
      return vec2(dBx, dBy);
    }
    vec3 perturbNormal(vec3 pos, vec3 n, vec2 dHdxy) {
      vec3 vSigmaX = dFdx(pos), vSigmaY = dFdy(pos);
      vec3 R1 = cross(vSigmaY, n), R2 = cross(n, vSigmaX);
      float fDet = dot(vSigmaX, R1);
      vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
      return normalize(abs(fDet) * n - vGrad);
    }

    void main() {
      vec3 day = texture2D(dayMap, vUv).rgb;
      vec3 col = day * 0.96;
      /* 图集式山体阴影（比值法：平地严格中性，只有坡度改变明暗） */
      vec3 n = normalize(vVN);
      vec3 nBumped = perturbNormal(vVP, n, dHdxy_fwd());
      vec3 L = normalize(vec3(-0.45, 0.42, 0.78));
      float shade = clamp(dot(n, L) / max(dot(nBumped, L), 0.25), 0.62, 1.45);
      col *= shade;
      vec3 viewDir = normalize(vVP);
      float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
      col += vec3(0.30, 0.62, 1.0) * fres * 0.50;
      gl_FragColor = vec4(col, 1.0);
    }`;

  /* 云层：密度存于贴图 alpha 通道，全昼均匀白 */
  const CLOUD_FS = `
    precision highp float;
    uniform sampler2D cloudMap; uniform vec3 sunDir;
    varying vec2 vUv; varying vec3 vWN;
    void main() {
      vec4 c = texture2D(cloudMap, vUv);
      float density = c.a;
      vec3 col = vec3(0.97);
      float alpha = density * 0.80;
      gl_FragColor = vec4(col, alpha);
    }`;

  /* 大气辉光壳（BackSide）：经典视角法线辉光 + 昼侧增强 */
  const ATMO_VS = `
    varying vec3 vVN; varying vec3 vWN;
    void main() {
      vVN = normalize(normalMatrix * normal);
      vWN = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
  const ATMO_FS = `
    precision highp float;
    uniform vec3 glowColor; uniform vec3 sunDir;
    varying vec3 vVN; varying vec3 vWN;
    void main() {
      float rim = pow(max(0.74 - dot(vVN, vec3(0.0, 0.0, 1.0)), 0.0), 3.0) * 1.45;
      gl_FragColor = vec4(glowColor, 1.0) * rim;
    }`;

  /* ---------- 星空（三层粒子） ---------- */
  function buildStars() {
    const layers = [
      { n: 1500, size: 1.4, opacity: 0.55, colored: false },
      { n: 260, size: 3.2, opacity: 0.85, colored: false },
      { n: 46, size: 7.0, opacity: 0.95, colored: true },
    ];
    for (const L of layers) {
      const pos = new Float32Array(L.n * 3);
      const col = new Float32Array(L.n * 3);
      for (let i = 0; i < L.n; i++) {
        // 均匀分布于远球壳
        const u = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        const r = 6500 + Math.random() * 2200;
        pos[i * 3] = Math.cos(a) * s * r;
        pos[i * 3 + 1] = u * r;
        pos[i * 3 + 2] = Math.sin(a) * s * r;
        if (L.colored) {
          // 少量彩色亮星：偏蓝 / 偏橙
          const warm = Math.random() < 0.5;
          col[i * 3] = warm ? 1.0 : 0.62;
          col[i * 3 + 1] = 0.8;
          col[i * 3 + 2] = warm ? 0.55 : 1.0;
        } else {
          const b = 0.75 + Math.random() * 0.25;
          col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = b;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = new THREE.PointsMaterial({
        size: L.size,
        map: L.colored ? BPTexturesCache.starFlare : BPTexturesCache.glowDot,
        vertexColors: true,
        transparent: true,
        opacity: L.opacity,
        depthWrite: false,
        sizeAttenuation: false,   // 星点用像素尺寸，缩放不闪烁
      });
      const pts = new THREE.Points(g, m);
      scene.add(pts);
      starLayers.push(pts);
    }
  }

  /* ---------- 板块边界弧线（示意） ---------- */
  function buildPlates() {
    plateGroup = new THREE.Group();
    const conf = [
      { lines: BP_PLATES.convergent, color: 0xff6b4a },  // 汇聚型：橙红
      { lines: BP_PLATES.divergent, color: 0x3ddca8 },   // 离散型：青绿
    ];
    for (const { lines, color } of conf) {
      for (const poly of lines) {
        const pts = poly.map(([la, lo]) => latLonToVec3(la, lo, R * 1.006));
        const g = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(g, new THREE.LineBasicMaterial({
          color, transparent: true, opacity: 0.85, depthWrite: false,
        }));
        plateGroup.add(line);
        // 叠一条加亮的细线增强观感
        const glow = new THREE.Line(g, new THREE.LineBasicMaterial({
          color, transparent: true, opacity: 0.22, depthWrite: false,
          blending: THREE.AdditiveBlending,
        }));
        glow.scale.setScalar(1.001);
        plateGroup.add(glow);
      }
    }
    earthGroup.add(plateGroup);
  }

  let BPTexturesCache = null; // 贴图缓存引用（buildStars 使用）

  /* ---------- 初始化 ---------- */
  function init(canvas, textures) {
    BPTexturesCache = textures;

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight));
    renderer.setClearColor(0x04070d, 1);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42,
      Math.max(1, window.innerWidth || 1) / Math.max(1, window.innerHeight || 1), 1, 20000);
    // 初始机位：亚洲上空远处（入场动画会推近）
    camera.position.copy(latLonToVec3(24, 105, 950));

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.45;
    controls.zoomSpeed = 0.7;
    controls.enablePan = false;
    controls.minDistance = 128;
    controls.maxDistance = 1600;

    buildStars();

    /* 地球组：地球本体 + 云 + 板块线（标记由 markers.js 挂入） */
    earthGroup = new THREE.Group();
    scene.add(earthGroup);

    earthMat = new THREE.ShaderMaterial({
      uniforms: {
        dayMap: { value: textures.earthDay },
        nightMap: { value: textures.earthNight },
        heightMap: { value: textures.earthTopo || textures.earthDay },
        uRelief: { value: 2.4 },   // 顶点位移强度（R=100 下珠峰约 +2.2）
        uBump: { value: 5.0 },     // 凹凸着色强度
        sunDir: { value: sunDir },
      },
      vertexShader: EARTH_VS,
      fragmentShader: EARTH_FS,
    });
    earthMat.extensions = { derivatives: true };  // WebGL1 回退时启用 dFdx/dFdy
    const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), earthMat);
    earthGroup.add(earth);

    /* 云壳 */
    const cloudMat = new THREE.ShaderMaterial({
      uniforms: {
        cloudMap: { value: textures.earthClouds },
        sunDir: { value: sunDir },
      },
      vertexShader: COMMON_VS,
      fragmentShader: CLOUD_FS,
      transparent: true,
      depthWrite: false,
    });
    cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 64, 48), cloudMat);
    earthGroup.add(cloudMesh);

    /* 大气辉光壳 */
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.06, 64, 48),
      new THREE.ShaderMaterial({
        uniforms: { glowColor: { value: new THREE.Color(0x4d9fff) }, sunDir: { value: sunDir } },
        vertexShader: ATMO_VS,
        fragmentShader: ATMO_FS,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      })
    );
    scene.add(atmo);

    buildPlates();
    updateSun();
    resize();   // 用钳制过的真实视口重建投影，规避遮挡期 0 尺寸污染
  }

  /* ---------- 相机飞行（球面插值，避免穿越地球） ---------- */
  let flying = null;
  function flyTo(lat, lon, dist, duration = 1500, onDone) {
    const target = latLonToVec3(lat, lon, dist).applyQuaternion(earthGroup.quaternion);
    const from = camera.position.clone();
    const s0 = new THREE.Spherical().setFromVector3(from);
    const s1 = new THREE.Spherical().setFromVector3(target);
    // 经度取最短弧
    let dTheta = s1.theta - s0.theta;
    if (dTheta > Math.PI) dTheta -= Math.PI * 2;
    if (dTheta < -Math.PI) dTheta += Math.PI * 2;
    flying = {
      t: 0, duration, onDone,
      s0, dTheta,
      dPhi: s1.phi - s0.phi,
      dR: s1.radius - s0.radius,
    };
    controls.enabled = false;
  }
  function stepFlight(dtMs) {
    if (!flying) return;
    flying.t += dtMs;
    let k = Math.min(flying.t / flying.duration, 1);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // easeInOutCubic
    const s = new THREE.Spherical(
      flying.s0.radius + flying.dR * e,
      Math.max(0.05, Math.min(Math.PI - 0.05, flying.s0.phi + flying.dPhi * e)),
      flying.s0.theta + flying.dTheta * e
    );
    camera.position.setFromSpherical(s);
    camera.lookAt(0, 0, 0);
    if (k >= 1) {
      const done = flying.onDone;
      flying = null;
      controls.enabled = true;
      controls.update();
      if (done) done();
    }
  }
  function isFlying() { return !!flying; }

  /* ---------- 每帧更新 ---------- */
  const spinState = { auto: true, pausedByCard: false, lastUserTouch: -1e9 };

  function updateSun() {
    const v = computeSunDir(timeApi.now());
    sunDir.set(v.x, v.y, v.z);
  }

  function update(dtSec, dtMs, nowSec) {
    // 投影矩阵污染守卫（遮挡期异常尺寸曾致 NaN 扩散到拾取/标注）
    if (!Number.isFinite(camera.projectionMatrix.elements[0]) ||
        !Number.isFinite(camera.aspect)) resize();
    timeApi.advance(dtSec);
    updateSun();
    stepFlight(dtMs);
    if (!flying) controls.update();

    // 自转：图层开关 + 无卡片 + 用户停止交互 3 秒后
    const idle = nowSec - spinState.lastUserTouch > 3;
    if (spinState.auto && !spinState.pausedByCard && idle && !flying) {
      earthGroup.rotation.y += dtSec * SPIN_RATE;
    }
    cloudMesh.rotation.y += dtSec * CLOUD_DRIFT;
  }

  function render() { renderer.render(scene, camera); }

  function setPixelRatio(v) { renderer.setPixelRatio(v); }

  function resize() {
    const w = Math.max(1, window.innerWidth || 1);
    const h = Math.max(1, window.innerHeight || 1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  return {
    R, RELIEF, init, update, render, resize, flyTo, isFlying, latLonToVec3,
    setPixelRatio,
    time: timeApi,
    sunDir,
    get camera() { return camera; },
    get scene() { return scene; },
    get earthGroup() { return earthGroup; },
    get controls() { return controls; },
    get cloudMesh() { return cloudMesh; },
    get plateGroup() { return plateGroup; },
    get spin() { return spinState; },
  };
})();
