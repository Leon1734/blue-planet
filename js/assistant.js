/* ============================================================
   BluePlanet 地理小助手（v5：接入免费大模型）
   - 服务商：智谱 GLM-4-Flash（免费）/ 硅基流动（免费档）/ 自定义 OpenAI 兼容
   - Key 只存本机 localStorage（bp_llm_v1），直连官方端点
   - 流式 SSE 输出；未配 Key 或请求失败自动回落本地规则库（永久兜底）
   - 回答气泡角标标明来源：🤖本地 / ✨模型名
   ============================================================ */

const BPAssistant = (() => {

  const $ = (id) => document.getElementById(id);
  const LLM_KEY = 'bp_llm_v1';
  let open = false;
  let busy = false;

  /* ---------- 服务商定义 ---------- */
  const LLM_PROVIDERS = {
    zhipu: {
      name: '智谱 GLM-4-Flash（免费）',
      url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      model: 'glm-4-flash',
      hint: 'open.bigmodel.cn 注册 → API Keys 创建即可，glm-4-flash 免费',
    },
    siliconflow: {
      name: '硅基流动（免费档）',
      url: 'https://api.siliconflow.cn/v1/chat/completions',
      model: 'Qwen/Qwen2.5-7B-Instruct',
      hint: 'cloud.siliconflow.cn 注册送额度，免费模型直接调用',
    },
    custom: {
      name: '自定义 OpenAI 兼容端点',
      url: '',
      model: '',
      hint: '填入任意 OpenAI 兼容的 /chat/completions 地址',
    },
  };

  /* ---------- 本地规则库（永久兜底） ---------- */
  const localService = {
    reply(text) {
      const q = text.trim().toLowerCase();
      if (!q) return { text: '想问什么？试试「珠峰有多高」「地球里面是什么」～' };
      for (const item of BP_CHAT_KB) {
        if (item.k.some(k => q.includes(k.toLowerCase()))) {
          return { text: item.a, poi: item.poi || null };
        }
      }
      let best = null, bestScore = 0;
      for (const p of BP_POIS) {
        const hay = (p.title + (p.tags || []).join('')).toLowerCase();
        const hits = [...q].filter(ch => ch.trim() && hay.includes(ch)).length;
        if (hits > bestScore && hits >= 2) { bestScore = hits; best = p; }
      }
      if (best) return { text: `帮你找到相关知识：\n【${best.title}】${best.summary}`, poi: best.id };
      return { text: '这个问题我还没学会呢🤔 试试：珠峰有多高 / 地球里面是什么 / 为什么有火山（或在 ⚙️ 里配置免费大模型 Key，解锁无限问答）' };
    },
  };

  /* ---------- 大模型配置 ---------- */
  let llm = { provider: 'zhipu', key: '', model: '', url: '' };
  function loadLlm() {
    try {
      const raw = localStorage.getItem(LLM_KEY);
      if (raw) llm = Object.assign(llm, JSON.parse(raw));
    } catch (e) {}
  }
  function saveLlm() {
    try { localStorage.setItem(LLM_KEY, JSON.stringify(llm)); } catch (e) {}
  }
  function llmReady() {
    const p = LLM_PROVIDERS[llm.provider];
    if (!llm.key) return false;
    if (llm.provider === 'custom') return !!(llm.url && llm.model);
    return !!p.url;
  }
  function llmModel() { return llm.model || (LLM_PROVIDERS[llm.provider].model || ''); }
  function llmUrl() { return llm.provider === 'custom' ? llm.url : LLM_PROVIDERS[llm.provider].url; }

  /* 当前选中知识点 → 注入上下文 */
  function contextText() {
    try {
      const id = BPMarkers.getSelected();
      const poi = id && BP_POIS.find(p => p.id === id);
      if (poi) return `\n用户当前正在查看知识点「${poi.title}」（${poi.summary}），回答可以适当围绕它展开。`;
    } catch (e) {}
    return '';
  }

  /* ---------- 大模型流式调用（SSE） ---------- */
  async function llmStream(q, onDelta) {
    const messages = [
      { role: 'system', content: '你是"蓝色星球"科普页的地理助手，面向中文青少年。回答简洁、准确、有趣，不超过 200 字，可以使用 1-2 个 emoji。' + contextText() },
      { role: 'user', content: q },
    ];
    const resp = await fetch(llmUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + llm.key },
      body: JSON.stringify({ model: llmModel(), messages, stream: true, max_tokens: 500, temperature: 0.7 }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined,
    });
    if (!resp.ok || !resp.body) {
      const t = await resp.text().catch(() => '');
      throw new Error('HTTP ' + resp.status + ' ' + t.slice(0, 60));
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', acc = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const j = JSON.parse(data);
          const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
          if (delta) { acc += delta; onDelta(acc); }
        } catch (e) { /* 忽略心跳/截断行 */ }
      }
    }
    if (!acc) throw new Error('空回复');
    return acc;
  }

  function service() {
    return llmReady()
      ? { reply: (q, onDelta) => llmStream(q, onDelta).then(t => ({ text: t, source: '✨ ' + llmModel() })), external: true }
      : { reply: (q) => { const r = localService.reply(q); return Promise.resolve({ text: r.text, poi: r.poi, source: '🤖 本地' }); }, external: false };
  }

  /* ---------- UI ---------- */
  function addBubble(cls, html) {
    const div = document.createElement('div');
    div.className = 'chat-bubble ' + cls;
    div.innerHTML = html;
    const body = $('chatBody');
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    return div;
  }

  function attachLink(div, poiId) {
    if (!poiId) return;
    const link = document.createElement('button');
    link.className = 'chat-link';
    link.textContent = '📍 带我去看看 →';
    link.addEventListener('click', () => {
      const api = BPPanels.selectApi;
      if (api && api.selectPoi) api.selectPoi(poiId);
      toggle();
    });
    div.appendChild(document.createElement('br'));
    div.appendChild(link);
  }

  function botSay(text, poiId, source) {
    const div = addBubble('bot', '');
    typing = true;
    let i = 0;
    const timer = setInterval(() => {
      i += 2;
      div.textContent = text.slice(0, i);
      $('chatBody').scrollTop = $('chatBody').scrollHeight;
      if (i >= text.length) {
        clearInterval(timer);
        typing = false;
        tagSource(div, source || '🤖 本地');
        attachLink(div, poiId);
        $('chatBody').scrollTop = $('chatBody').scrollHeight;
        if (queue.length) setTimeout(() => send(), 250);
      }
    }, 20);
  }

  function tagSource(div, source) {
    const tag = document.createElement('span');
    tag.className = 'chat-src';
    tag.textContent = source;
    div.appendChild(document.createElement('br'));
    div.appendChild(tag);
  }

  function botStream(bubbleDiv, streamGen) {
    /* 大模型流式：bubble 由 onDelta 直接更新 */
    typing = true;
    return streamGen.then(({ text, source }) => {
      bubbleDiv.textContent = text;
      tagSource(bubbleDiv, source || '✨ 大模型');
      typing = false;
      $('chatBody').scrollTop = $('chatBody').scrollHeight;
      if (queue.length) setTimeout(() => send(), 250);
    });
  }

  function send() {
    const input = $('chatInput');
    const text = (input ? input.value : '').trim();
    if (busy || typing) {
      if (text) { queue.push(text); input.value = ''; }
      return;
    }
    const q = queue.length ? queue.shift() : text;
    if (!q) return;
    if (input) input.value = '';
    addBubble('user', '').textContent = q;

    const svc = service();
    if (!svc.external) {
      busy = true;
      const thinking = addBubble('bot', '<i style="opacity:.6">思考中…</i>');
      setTimeout(async () => {
        try {
          const r = await svc.reply(q);           // 本地回复也统一为 Promise
          thinking.remove();
          botSay(r.text, r.poi || null, r.source || '🤖 本地');
        } catch (e) {
          thinking.innerHTML = '出错了，请再试一次…';
        }
        busy = false;
      }, 250);
    } else {
      busy = true;
      const bubble = addBubble('bot', '<i style="opacity:.6">连接大模型…</i>');
      svc.reply(q, (acc) => { bubble.textContent = acc; $('chatBody').scrollTop = $('chatBody').scrollHeight; })
        .then(() => { tagSource(bubble, '✨ ' + llmModel()); busy = false; $('chatBody').scrollTop = $('chatBody').scrollHeight; })
        .catch((e) => {
          bubble.remove();
          const r = localService.reply(q);
          botSay(r.text, r.poi, '🤖 本地（大模型降级：' + String(e.message).slice(0, 40) + '）');
          busy = false;
        });
    }
  }

  /* ---------- 设置面板 ---------- */
  function toggleSettings() {
    const box = $('chatSettings');
    box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) fillSettings();
  }
  function fillSettings() {
    $('llmProvider').value = llm.provider;
    $('llmKey').value = llm.key;
    $('llmModel').value = llm.model;
    $('llmUrl').value = llm.url || '';
    $('llmHint').textContent = (LLM_PROVIDERS[llm.provider] || {}).hint || '';
  }
  function wireSettings() {
    $('llmToggle').addEventListener('click', toggleSettings);
    $('llmProvider').addEventListener('change', () => { llm.provider = $('llmProvider').value; fillSettings(); });
    $('llmKey').addEventListener('input', () => llm.key = $('llmKey').value.trim());
    $('llmModel').addEventListener('input', () => llm.model = $('llmModel').value.trim());
    $('llmUrl').addEventListener('input', () => llm.url = $('llmUrl').value.trim());
    $('llmSave').addEventListener('click', async () => {
      saveLlm();
      const res = $('llmTestResult');
      if (!llmReady()) { res.textContent = '⚠️ 请先填 Key'; res.style.color = '#ff9d9d'; return; }
      res.textContent = '测试中…'; res.style.color = '#9FB6C9';
      try {
        const r = await llmStream('用三个字回答：地球是圆的吗？', () => {});
        res.textContent = '✅ 连通成功：' + r.slice(0, 20); res.style.color = '#3DBE8B';
        toast('✨ 大模型已接入：' + llmModel());
      } catch (e) {
        res.textContent = '❌ ' + String(e.message).slice(0, 50); res.style.color = '#ff9d9d';
      }
    });
  }

  function toast(msg) {
    if (typeof BPPanels !== 'undefined' && BPPanels.toast) BPPanels.toast(msg);
  }

  /* ---------- 开合与输入 ---------- */
  const queue = [];
  let typing = false;

  function toggle() {
    open = !open;
    $('chatPanel').classList.toggle('hidden', !open);
    $('factCard').classList.toggle('hidden', open);
    $('btnAssistant').classList.toggle('on', open);
    /* 聊天面板与左侧模块导航同列：打开时自动收起导航，关闭恢复 */
    let prevNav = false;
    if (open) {
      document.body.classList.add('chat-open');
      if (typeof BPUI !== 'undefined' && BPUI.isNavCollapsed) {
        prevNav = BPUI.isNavCollapsed();
        if (!prevNav) BPUI.setNavCollapsed(true);
      }
    } else {
      document.body.classList.remove('chat-open');
      if (typeof BPUI !== 'undefined' && BPUI.setNavCollapsed && !prevNav) {
        BPUI.setNavCollapsed(false);
      }
    }
    if (open) {
      if (!$('chatBody').children.length) {
        const ready = llmReady();
        botSay(ready
          ? `你好！我是地理小助手 🌍 已接入 ${llmModel()}，任何地理问题都可以问！\n比如：为什么海水是咸的？\n喜马拉雅还在长高吗？`
          : '你好！我是地理小助手 🌍\n关于地球的一切都可以问我，比如：\n· 珠峰有多高？\n· 地球里面是什么？\n点右上 ⚙️ 可接入免费大模型（GLM-4-Flash），解锁无限问答！');
      }
      setTimeout(() => $('chatInput').focus(), 100);
    }
  }

  function wire() {
    $('btnAssistant').addEventListener('click', toggle);
    $('chatClose').addEventListener('click', toggle);
    $('chatSend').addEventListener('click', send);
    $('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    document.querySelectorAll('.chat-chip').forEach(chip => {
      chip.addEventListener('click', () => { $('chatInput').value = chip.textContent; send(); });
    });
    wireSettings();
    loadLlm();
  }

  return {
    wire, toggle,
    get isOpen() { return open; },
  };
})();
