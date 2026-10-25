/* ============================================================
   BluePlanet 语音朗读（v25）
   - 基于 Web Speech API（浏览器内置，零依赖、离线可用）
   - 知识卡片「🔊 朗读」：标题 + 摘要
   - 深时纪元旁白：纪元名 + 年代 + 简介 + 生命（可选开关）
   - 不支持语音合成的环境静默降级（按钮提示"不支持"）
   ============================================================ */

const BPTTS = (() => {

  const ok = () => 'speechSynthesis' in window;

  /* 声音列表异步加载：页面加载后预热一次，取 zh-CN 声音 */
  let voice = null;
  function warm() {
    if (!ok()) return;
    const pick = () => {
      const vs = window.speechSynthesis.getVoices();
      voice = vs.find(v => /zh[-_]CN/i.test(v.lang) && /female|女|Xiaoxiao|Yaoyao/i.test(v.name))
        || vs.find(v => /zh[-_]CN/i.test(v.lang))
        || vs.find(v => /^zh/i.test(v.lang))
        || null;
    };
    pick();
    window.speechSynthesis.addEventListener?.('voiceschanged', pick);
  }

  /**
   * 朗读文本；开始前打断上一段。
   * @param {string} text
   * @param {{rate?:number, onend?:Function}} opts
   * @returns {boolean} 是否成功开始（不支持则 false）
   */
  function speak(text, opts = {}) {
    if (!ok() || !text) return false;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = opts.rate || 0.95;
      if (voice) u.voice = voice;
      if (opts.onend) u.onend = opts.onend;
      window.speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  }

  function stop() {
    if (ok()) { try { window.speechSynthesis.cancel(); } catch (e) {} }
  }

  function speaking() {
    return ok() && window.speechSynthesis.speaking;
  }

  warm();
  return { speak, stop, speaking, supported: ok };
})();
