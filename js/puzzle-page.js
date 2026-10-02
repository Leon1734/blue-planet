/* ============================================================
   大陆拼图独立页驱动（v8）
   - 复用 js/puzzle.js 的 BPPuzzle；不依赖 3D 场景
   - 贴图来源：http(s) 直接加载 textures/earth_day.jpg；
     file:// 回落 textures-data.js 内嵌 data URI
   ============================================================ */

(() => {
  const $ = (id) => document.getElementById(id);

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* puzzle.js 的 toast/badge 可选依赖在此提供 */
  window.BPPanels = { toast, selectApi: {} };
  window.BPGame = {
    profile: { badges: [] },
    badges: [],
    markPuzzle() {
      toast('🎉 拼图完成！去主站解锁更多地理知识吧');
      return [];
    },
  };

  /* 语言等引用安全（puzzle.js 未用到的全局不引） */

  function loadImageOnline() {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('online img fail'));
      img.src = 'textures/earth_day.jpg';
    });
  }
  function loadImageInline() {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('inline img fail'));
      img.src = (typeof BP_TEXTURE_DATA !== 'undefined') ? BP_TEXTURE_DATA.day : '';
    });
  }

  async function boot() {
    let img;
    try {
      img = await loadImageOnline();
    } catch (e) {
      img = await loadImageInline();
    }
    /* 喂给 puzzle.js（其 init 使用 BPTextures——独立页提供最小桩） */
    if (typeof BP_TEXTURE_DATA === 'undefined') window.BP_TEXTURE_DATA = {};
    window.BPTextures = {
      load() {
        return Promise.resolve({ earthDay: { image: img } });
      },
      sampleHeight: () => 0,
    };
    BPPuzzle.open();
    toast('🧩 把大陆拖到地图上正确的位置！');
  }

  document.querySelectorAll('#diffRow .tab').forEach(b => {
    b.addEventListener('click', () => {
      BPPuzzle.setDifficulty(b.dataset.pd);
      document.querySelectorAll('#diffRow .tab').forEach(x => x.classList.toggle('on', x === b));
    });
  });
  $('btnRestart').addEventListener('click', () => { BPPuzzle.restart(); toast('新的一局开始！'); });

  boot();
})();
