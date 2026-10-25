/* ============================================================
   BluePlanet 新手引导（v31）
   - 首次访问自动弹出 4 步上手向导（localStorage 记忆已看）
   - 快捷键帮助面板底部"重看新手引导"可随时回看
   ============================================================ */

const BPOnboard = (() => {

  const KEY = 'bp_onboarded_v1';
  const $ = (id) => document.getElementById(id);

  const STEPS = [
    { icon: '🖱️', t: '先玩转地球',
      d: '按住拖动旋转地球，滚轮/双指缩放。山川起伏、大洋大河都看得见——它会自转，也可以随时让它停下。' },
    { icon: '📌', t: '点亮知识光柱',
      d: '点击地表彩色的光柱标记，地球会飞过去并打开知识卡片：图解、数据、冷知识、朗读、收藏、明信片都在卡片里。左侧还能按 9 大模块浏览。' },
    { icon: '🧭', t: '打开工具箱',
      d: '底部工具条：🦕 深时穿越 5 亿年、🧩 大陆拼图、🧪 地理实验室、📐 测量两地距离、🎯 知识闯关、📊 数据看板……每个按钮都是一个新世界。' },
    { icon: '⌨️', t: '更快一点的技巧',
      d: '按 / 直接搜索（支持拼音首字母：zmf 找珠峰），R 随机探索，M 测量，1-9 切换模块，按 ? 查看全部快捷键。祝你成为环球地理学家！' },
  ];

  let idx = 0;

  function seen() {
    try { return !!localStorage.getItem(KEY); } catch (e) { return true; }
  }

  function render() {
    const s = STEPS[idx];
    $('obIcon').textContent = s.icon;
    $('obTitle').textContent = `${idx + 1}. ${s.t}`;
    $('obDesc').textContent = s.d;
    $('obDots').innerHTML = STEPS.map((_, i) =>
      `<i class="${i === idx ? 'on' : ''}"></i>`).join('');
    $('obPrev').style.visibility = idx === 0 ? 'hidden' : 'visible';
    $('obNext').textContent = idx === STEPS.length - 1 ? '🚀 开始探索' : '下一步 →';
  }

  function open() {
    idx = 0;
    $('onboardModal').classList.remove('hidden');
    render();
  }

  function close() {
    $('onboardModal').classList.add('hidden');
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
  }

  function next() {
    if (idx >= STEPS.length - 1) close();
    else { idx++; render(); }
  }

  /* 首次访问：boot 后 1.2 秒弹出 */
  function maybeShow() {
    if (seen()) return;
    setTimeout(open, 1200);
  }

  function wire() {
    $('obNext').addEventListener('click', next);
    $('obPrev').addEventListener('click', () => { if (idx > 0) { idx--; render(); } });
    $('obSkip').addEventListener('click', close);
    $('onboardModal').addEventListener('click', (e) => { if (e.target === $('onboardModal')) close(); });
    /* 快捷键帮助面板底部：重看引导 */
    const replay = $('obReplay');
    if (replay) replay.addEventListener('click', () => {
      const h = document.getElementById('kbdHelp');
      if (h) h.classList.add('hidden');
      open();
    });
  }

  return { wire, maybeShow, open, close };
})();
