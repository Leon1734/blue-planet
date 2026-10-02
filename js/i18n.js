/* ============================================================
   BluePlanet 双语层（v8 / V1）
   - 覆盖 UI chrome（工具条/模块名/图层/遮罩/时钟标签等）
   - 知识内容（POI 文案/题库）保持中文，界面语言按钮注明
   - localStorage 记忆选择；t(key) 全站取词
   ============================================================ */

const BPi18n = (() => {

  const $ = (id) => document.getElementById(id);

  const DICT = {
    zh: {
      cutaway: '剖析', tours: '巡礼', deeptime: '深时', puzzle: '拼图', lab: '实验',
      quiz: '闯关', insights: '看板', badges: '徽章', assistant: '助手', random: '随机',
      interior: '地球内部', plates: '板块与地震', volcano: '火山', ocean: '海洋与洋流',
      climate: '大气与气候', landform: '地貌与河流', polar: '极地与冰川', human: '人类与地球', earth: '地球档案',
      lblLabels: '地名', lblRivers: '河流', lblCurrents: '洋流', lblWinds: '风带',
      lblClimate: '气候带', lblPlates: '板块', lblQuakes: '地震', lblClouds: '云层',
      lblMarkers: '兴趣点', lblSpin: '自转',
      bjTime: '北京时间', today: '今日地球', fact: '冷知识', next: '换一条',
      modules: '知识模块', visited: '已点亮',
      loading: '正在点亮地球…', langBtn: 'EN',
      contentZhOnly: '（知识内容暂为中文）',
    },
    en: {
      cutaway: 'Core', tours: 'Tours', deeptime: 'DeepTime', puzzle: 'Puzzle', lab: 'Lab',
      quiz: 'Quiz', insights: 'Charts', badges: 'Badges', assistant: 'Ask', random: 'Random',
      interior: 'Interior', plates: 'Plates', volcano: 'Volcanoes', ocean: 'Oceans',
      climate: 'Climate', landform: 'Landforms', polar: 'Polar', human: 'Human Age', earth: 'Earth File',
      lblLabels: 'Names', lblRivers: 'Rivers', lblCurrents: 'Currents', lblWinds: 'Winds',
      lblClimate: 'Zones', lblPlates: 'Plates', lblQuakes: 'Quakes', lblClouds: 'Clouds',
      lblMarkers: 'POIs', lblSpin: 'Spin',
      bjTime: 'Beijing', today: 'Earth Today', fact: 'Did you know', next: 'Next',
      modules: 'MODULES', visited: 'lit',
      loading: 'Lighting up the globe…', langBtn: '中',
      contentZhOnly: '(articles remain in Chinese for now)',
    },
  };

  const KEY = 'bp_lang_v1';
  let lang = 'zh';
  try { lang = localStorage.getItem(KEY) || 'zh'; } catch (e) {}

  function t(key) {
    return (DICT[lang] && DICT[lang][key]) || DICT.zh[key] || key;
  }

  function setLang(l) {
    lang = (l === 'en') ? 'en' : 'zh';
    try { localStorage.setItem(KEY, lang); } catch (e) {}
    apply();
  }

  function apply() {
    /* 工具条 */
    const toolMap = { btnCutaway: 'cutaway', btnTours: 'tours', btnDeeptime: 'deeptime', btnPuzzle: 'puzzle', btnLab: 'lab', btnQuiz: 'quiz', btnInsights: 'insights', btnBadges: 'badges', btnAssistant: 'assistant', btnRandom: 'random' };
    for (const [id, key] of Object.entries(toolMap)) {
      const btn = document.getElementById(id);
      if (!btn) continue;
      const txt = btn.querySelector('.tool-txt');
      if (txt) txt.textContent = t(key);
    }
    /* 模块导航 */
    const modMap = { interior: 'interior', plates: 'plates', volcano: 'volcano', ocean: 'ocean', climate: 'climate', landform: 'landform', polar: 'polar', human: 'human', earth: 'earth' };
    document.querySelectorAll('#moduleList li').forEach(li => {
      const nameSpan = li.querySelectorAll('span')[1];
      const en = modMap[li.dataset.module];
      if (nameSpan && en) nameSpan.textContent = t(en);
    });
    const head = document.querySelector('.module-nav-head > span');
    if (head) head.textContent = t('modules');
    /* 图层按钮 */
    const layerMap = { labels: 'lblLabels', rivers: 'lblRivers', currents: 'lblCurrents', winds: 'lblWinds', climate: 'lblClimate', plates: 'lblPlates', quakes: 'lblQuakes', clouds: 'lblClouds', markers: 'lblMarkers', spin: 'lblSpin' };
    document.querySelectorAll('.layer-btn').forEach(btn => {
      const txt = btn.querySelector('.layer-txt');
      const k = layerMap[btn.dataset.layer];
      if (txt && k) txt.textContent = t(k);
    });
    /* 时钟标签 / 今日地球 / 冷知识 */
    const bj = document.querySelector('#clockBox .clock-label');
    if (bj) bj.textContent = t('bjTime');
    const th = document.querySelector('#factCard .fact-head');
    if (th) th.childNodes.forEach(n => { if (n.nodeType === 3 && n.textContent.includes('今日地球')) n.textContent = '📅 ' + t('today') + ' '; });
    const fh2 = document.querySelector('.fact-head2');
    if (fh2) {
      fh2.childNodes.forEach(n => { if (n.nodeType === 3 && n.textContent.includes('冷知识')) n.textContent = '💡 ' + t('fact') + ' '; });
      const nb = $('factNext');
      if (nb) nb.textContent = t('next');
    }
    /* 加载遮罩 */
    const ls = document.querySelector('.loading-sub');
    if (ls) ls.textContent = t('loading');
    /* 语言按钮自身 */
    const lb = $('btnLang');
    if (lb) lb.textContent = t('langBtn');
  }

  function init() {
    const btn = $('btnLang');
    if (btn) {
      btn.textContent = t('langBtn');
      btn.title = '切换界面语言 / Switch UI language' + t('contentZhOnly');
      btn.addEventListener('click', () => setLang(lang === 'zh' ? 'en' : 'zh'));
    }
    apply();
  }

  return { init, apply, setLang, t, get lang() { return lang; } };
})();
