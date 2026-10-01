/* ============================================================
   BluePlanet 贴图层
   - 地球昼夜/云贴图：来自 textures-data.js 内嵌 data URI
     （file:// 下浏览器拒绝加载本地图片纹理，内嵌可双击直开）
   - 星点/光晕等小纹理：Canvas 程序生成，零外部依赖
   ============================================================ */

const BPTextures = (() => {

  /* 程序生成：柔光圆点纹理（星点 / 光柱顶端亮豆共用） */
  function makeGlowDot(size, inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.35, outer);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    return t;
  }

  /* 程序生成：四角星芒（亮星用） */
  function makeStarFlare() {
    const S = 64, c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const cx = S / 2;
    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    // 十字星芒
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx, 4); ctx.lineTo(cx, S - 4);
    ctx.moveTo(4, cx); ctx.lineTo(S - 4, cx);
    ctx.stroke();
    return new THREE.CanvasTexture(c);
  }

  /* 从 data URI 同步解码为 THREE 纹理（内嵌数据解码在毫秒级） */
  function fromDataURI(uri, configure) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const t = new THREE.Texture(img);
        t.needsUpdate = true;
        if (configure) configure(t);
        resolve(t);
      };
      img.onerror = () => reject(new Error('贴图解码失败'));
      img.src = uri;
    });
  }

  let cache = null;
  let topoData = null;   // 高程 ImageData（JS 侧采样用，1024×512）

  /* 采样某经纬度的归一化高程（0=海平面，1=最高山）
     —— 供标记/标注锚点贴合隆起后的地形 */
  function sampleHeight(lat, lon) {
    if (!topoData) return 0;
    const W = 1024, H = 512;
    const x = Math.min(W - 1, Math.max(0, Math.round((lon + 180) / 360 * W)));
    const y = Math.min(H - 1, Math.max(0, Math.round((90 - lat) / 180 * H)));
    const i = (y * W + x) * 4;
    return topoData[i] / 255;
  }

  function buildTopoSampler(img) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, 1024, 512);
    topoData = ctx.getImageData(0, 0, 1024, 512).data;
  }

  return {
    sampleHeight,
    /* 惰性取光晕贴图（供 cutaway 等模块的 Sprite 用） */
    glowDotTex: () => (cache ? cache.glowDot : null),
    /* 全部贴图一次性加载（成功后回调 textures 对象）
       N1①：http(s) 环境直接加载 textures/ 真实文件（首屏省 ~1.2MB 内嵌解析）；
             file:// 无跨域加载能力，回落 base64 内嵌数据（BP_TEXTURE_DATA） */
    load() {
      if (cache) return Promise.resolve(cache);
      const D = (typeof BP_TEXTURE_DATA !== 'undefined') ? BP_TEXTURE_DATA : null;
      const fail = (k) => Promise.reject(new Error('缺少 ' + k + ' 贴图'));
      const ONLINE = location.protocol === 'http:' || location.protocol === 'https:';
      const texLoader = new THREE.TextureLoader();
      const fromURL = (rel, configure, optional) => new Promise((resolve, reject) => {
        texLoader.load(rel, (t) => { if (configure) configure(t); resolve(t); },
          undefined, () => (optional ? resolve(null) : reject(new Error('在线贴图加载失败 ' + rel))));
      });
      const jobs = ONLINE ? [
        fromURL('textures/earth_day.jpg', t => { t.anisotropy = 4; }),
        fromURL('textures/earth_night.png'),
        fromURL('textures/earth_clouds.png', t => { t.wrapS = THREE.RepeatWrapping; }),
        fromURL('textures/earth_topo.jpg', t => { t.anisotropy = 8; }, true),
      ] : [
        D ? fromDataURI(D.day, t => { t.anisotropy = 4; }) : fail('day'),
        D ? fromDataURI(D.night) : fail('night'),
        D ? fromDataURI(D.clouds, t => { t.wrapS = THREE.RepeatWrapping; }) : fail('clouds'),
        D && D.topo ? fromDataURI(D.topo, t => { t.anisotropy = 8; }) : Promise.resolve(null),
      ];
      return Promise.all(jobs).then(([day, night, clouds, topo]) => {
        if (topo) buildTopoSampler(topo.image);
        cache = {
          earthDay: day,
          earthNight: night,
          earthClouds: clouds,
          earthTopo: topo,
          sampleHeight,
          glowDotTex: () => (cache ? cache.glowDot : null),
          glowDot: makeGlowDot(64, 'rgba(255,255,255,1)', 'rgba(180,220,255,0.55)'),
          starFlare: makeStarFlare(),
        };
        return cache;
      });
    },
    sampleHeight,
  };
})();
