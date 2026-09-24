/* ============================================================
   BluePlanet 游戏化系统（M6）
   - 本地档案（localStorage）：已访问知识点 / 徽章 / 闯关最高分
   - 徽章：启航 + 8 模块收集章 + 环球地理学家（全收集）
   - 知识闯关：随机 10 题，即时判分 + 解析，成绩入档
   - 每日地球：按日期轮换的"今日推荐"知识点
   ============================================================ */

const BPGame = (() => {

  const KEY = 'bp_profile_v1';
  let profile = { visited: [], badges: [], quizBest: 0 };

  /* ---------- 档案 ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) profile = Object.assign(profile, JSON.parse(raw));
    } catch (e) { /* file:// 或隐私模式下降级为内存档案 */ }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch (e) {}
  }

  /* ---------- 徽章定义 ---------- */
  const badgeDef = () => {
    const list = [{ id: 'first', icon: '🚀', t: '初次启航', d: '点亮第一个知识点' }];
    BP_MODULES.forEach(m => list.push({
      id: 'mod-' + m.id, icon: iconOf(m.id), t: m.name + '家', d: `学完「${m.name}」全部知识点`,
    }));
    list.push({ id: 'all', icon: '🌍', t: '环球地理学家', d: '收集全部知识点' });
    list.push({ id: 'quiz60', icon: '🎯', t: '闯关新秀', d: '知识闯关 10 题对 6 题' });
    list.push({ id: 'quiz10', icon: '🏆', t: '闯关大师', d: '知识闯关 10 题全对' });
    list.push({ id: 'random20', icon: '🎲', t: '探险家', d: '随机探索 20 个不同知识点' });
    list.push({ id: 'random50', icon: '🛸', t: '随机大师', d: '随机探索累计 50 次' });
    return list;
  };
  function iconOf(mid) {
    return ({ interior: '⛏️', plates: '🧭', volcano: '🌋', ocean: '🌊',
      climate: '☁️', landform: '⛰️', polar: '❄️', human: '🏗️', earth: '🌍' })[mid] || '🏅';
  }

  const earned = (id) => profile.badges.includes(id);

  /* 访问知识点 → 返回新解锁徽章列表 */
  function markVisited(poiId) {
    if (!profile.visited.includes(poiId)) profile.visited.push(poiId);
    const fresh = [];
    const grant = (id) => { if (!earned(id)) { profile.badges.push(id); fresh.push(id); } };
    if (profile.visited.length >= 1) grant('first');
    BP_MODULES.forEach(m => {
      if (BP_POIS.filter(p => p.module === m.id).every(p => profile.visited.includes(p.id))) grant('mod-' + m.id);
    });
    if (profile.visited.length >= BP_POIS.length) grant('all');
    save();
    return fresh;
  }

  function markQuiz(score, total) {
    if (score > (profile.quizBest || 0)) { profile.quizBest = score; }
    const fresh = [];
    const grant = (id) => { if (!earned(id)) { profile.badges.push(id); fresh.push(id); } };
    if (score >= Math.ceil(total * 0.6)) grant('quiz60');
    if (score === total) grant('quiz10');
    save();
    return fresh;
  }

  /* 随机探索统计 → 探险家 / 随机大师徽章 */
  function markRandom(distinctCount, totalCount) {
    const fresh = [];
    const grant = (id) => { if (!earned(id)) { profile.badges.push(id); fresh.push(id); } };
    if (distinctCount >= 20) grant('random20');
    if (totalCount >= 50) grant('random50');
    save();
    return fresh;
  }

  /* ---------- 每日地球 ---------- */
  function dailyPoi() {
    const start = Date.UTC(2026, 0, 1);
    const day = Math.floor((Date.now() - start) / 86400000);
    return BP_POIS[((day % BP_POIS.length) + BP_POIS.length) % BP_POIS.length];
  }

  /* ---------- 知识闯关 ---------- */
  let quiz = null;   // { qs, idx, score, answered }
  function startQuiz() {
    const pool = [...BP_QUIZ];
    // 洗牌取 10
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    quiz = { qs: pool.slice(0, 10), idx: 0, score: 0, answered: false };
  }

  function answerQuiz(opt) {
    if (!quiz || quiz.answered) return null;
    quiz.answered = true;
    const ok = opt === quiz.qs[quiz.idx].c;
    if (ok) quiz.score++;
    return { ok, correct: quiz.qs[quiz.idx].c };
  }
  function nextQuiz() {
    if (!quiz) return false;
    quiz.answered = false;
    quiz.idx++;
    if (quiz.idx >= quiz.qs.length) {
      const fresh = markQuiz(quiz.score, quiz.qs.length);
      const result = { done: true, score: quiz.score, total: quiz.qs.length, fresh };
      quiz = null;
      return result;
    }
    return { done: false };
  }

  return {
    load, markVisited, markQuiz, markRandom, dailyPoi, startQuiz, answerQuiz, nextQuiz,
    get profile() { return profile; },
    get badges() { return badgeDef(); },
    get quizState() { return quiz; },
  };
})();
