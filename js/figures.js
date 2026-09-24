/* ============================================================
   BluePlanet 知识卡片图解库（v5）
   - 按 POI kind 生成手绘风 SVG 插图（离线恒定，模块色着色）
   - mountain 山峰 / volcano 火山 / ocean 海洋 / river 河流
     climate 大气 / ice 冰川极地 / human 人类工程 / geo 地球圈层
   - 用法：BPFigures.make(kind, colorHex) → '<svg>…</svg>'
   ============================================================ */

const BPFigures = (() => {

  const W = 300, H = 170;

  function esc(c) { return c; }

  /* 山峰：三层山脊 + 雪线 + 等高线 */
  function mountain(c) {
    return `
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1b2f44"/><stop offset="1" stop-color="#2c4a63"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    <circle cx="248" cy="34" r="16" fill="#FFD98a" opacity=".9"/>
    <path d="M-5 170 L70 60 L110 108 L150 40 L205 118 L245 78 L305 170 Z" fill="#31474f"/>
    <path d="M70 60 L88 84 L104 74 L110 108 L128 66 L150 40 L172 78 L188 96 L205 118 L225 92 L245 78 L268 112 L305 170 L-5 170 Z"
      fill="#5b6b63" opacity=".95"/>
    <path d="M150 40 L136 62 L146 70 L150 58 L158 72 L172 78 L205 118 L186 100 L172 78 L158 72 Z" fill="#e8f2f8"/>
    <path d="M0 150 q40 -14 75 0 q30 12 55 2 q35 -14 70 -2 q40 14 105 -4" stroke="${c}" stroke-width="1.6" fill="none" opacity=".55"/>
    <path d="M0 162 q45 -12 85 0 q35 10 65 0 q40 -12 80 0 q40 12 75 -2" stroke="${c}" stroke-width="1.2" fill="none" opacity=".35"/>`;
  }

  /* 火山：剖面（岩浆房-通道-火山灰柱） */
  function volcano(c) {
    return `
    <defs><linearGradient id="vs" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#241a20"/><stop offset="1" stop-color="#3a2a2c"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#vs)"/>
    <circle cx="150" cy="30" r="8" fill="#ffcf8a" opacity=".9"/>
    <circle cx="138" cy="20" r="10" fill="#9c9ca6" opacity=".55"/>
    <circle cx="160" cy="16" r="12" fill="#8a8a96" opacity=".45"/>
    <circle cx="150" cy="8" r="9" fill="#a8a8b2" opacity=".4"/>
    <path d="M20 150 L118 52 L136 66 L150 60 L164 66 L182 52 L280 150 Z" fill="#4a3b3e"/>
    <path d="M60 150 Q150 120 240 150 L240 170 L60 170 Z" fill="#c85a38" opacity=".9"/>
    <path d="M150 150 L136 96 Q134 80 150 66 Q166 80 164 96 L164 150 Z" fill="#e8863a"/>
    <ellipse cx="150" cy="138" rx="52" ry="22" fill="#ff8a4d" opacity=".8"/>
    <ellipse cx="150" cy="142" rx="34" ry="14" fill="#ffb066"/>
    <path d="M96 150 q-14 8 -26 20 M204 150 q14 8 26 20" stroke="#ff7a4d" stroke-width="5" fill="none" opacity=".85"/>
    <rect y="148" width="${W}" height="4" fill="#233042"/>`;
  }

  /* 海洋：大陆架-深海-海沟深度带 */
  function ocean(c) {
    return `
    <defs><linearGradient id="oc" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2f7fb8"/><stop offset=".55" stop-color="#14507e"/><stop offset="1" stop-color="#072a46"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#oc)"/>
    <path d="M-5 60 q30 -8 60 0 q30 8 60 0 q30 -8 60 0 q30 8 60 0 q30 -8 65 0 L305 30 L-5 30 Z" fill="#9ed3f5" opacity=".35"/>
    <path d="M-5 62 q30 -8 60 0 q30 8 60 0 q30 -8 60 0 q30 8 60 0 q30 -8 65 0" stroke="#bfe4fb" stroke-width="2.4" fill="none"/>
    <path d="M-5 96 Q90 78 150 88 Q210 98 305 70 L305 170 L-5 170 Z" fill="#3d5a45"/>
    <path d="M120 108 L165 96 L200 128 L232 156 L188 170 L138 170 L128 140 Z" fill="#22394a"/>
    <path d="M150 96 L172 104 L156 170 L128 170 Z" fill="#101f2c" opacity=".9"/>
    <circle cx="252" cy="44" r="13" fill="#ffd98a" opacity=".9"/>
    <path d="M196 128 q12 -8 22 2 q10 10 24 6" stroke="#7EB8E8" stroke-width="2" fill="none" opacity=".8"/>
    <circle cx="70" cy="88" r="3" fill="#cfeaff" opacity=".8"/><circle cx="84" cy="94" r="2.2" fill="#cfeaff" opacity=".6"/>`;
  }

  /* 河流：干流+支流+河口三角 */
  function river(c) {
    return `
    <defs><linearGradient id="rs" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#22394a"/><stop offset="1" stop-color="#2f4a56"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#rs)"/>
    <path d="M-5 130 q50 -30 90 -10 q40 20 70 -6 q30 -24 75 -10 q40 12 75 -4 L305 170 L-5 170 Z" fill="#28502f"/>
    <path d="M30 10 q18 34 44 52 q40 28 60 62 q16 30 44 44" stroke="#4da6dd" stroke-width="9" fill="none" stroke-linecap="round"/>
    <path d="M96 18 q4 30 24 46 M210 24 q-16 26 -42 40 M262 52 q-28 18 -58 32" stroke="#4da6dd" stroke-width="4.5" fill="none" stroke-linecap="round" opacity=".85"/>
    <path d="M150 132 q30 16 58 22 q34 6 70 2 L305 170 L150 170 Z" fill="#1d6f9c"/>
    <path d="M196 150 q30 -6 52 2 M216 160 q26 -8 46 -2" stroke="#8fd0f2" stroke-width="2" fill="none" opacity=".7"/>
    <circle cx="34" cy="12" r="5" fill="#9ed3f5"/>`;
  }

  /* 大气：分层弧+太阳+风向 */
  function climate(c) {
    return `
    <rect width="${W}" height="${H}" fill="#0d1b2a"/>
    <circle cx="150" cy="210" r="130" fill="#3DBE8B" opacity=".25"/>
    <path d="M20 210 A130 130 0 0 1 280 210" stroke="#3DBE8B" stroke-width="14" fill="none" opacity=".5"/>
    <path d="M40 210 A110 110 0 0 1 260 210" stroke="#FF9F45" stroke-width="10" fill="none" opacity=".4"/>
    <path d="M62 210 A88 88 0 0 1 238 210" stroke="#7EB8E8" stroke-width="8" fill="none" opacity=".4"/>
    <circle cx="52" cy="30" r="14" fill="#FFD98a"/>
    <path d="M96 52 q30 -10 56 4 M180 44 q26 -6 46 8" stroke="#9FB6C9" stroke-width="2.5" fill="none" marker-end="none" opacity=".8"/>
    <path d="M232 40 l14 8 l-12 8 z" fill="#9FB6C9"/>
    <path d="M112 78 q10 14 6 26 M132 72 q10 14 6 26" stroke="#8fd0f2" stroke-width="3" fill="none" stroke-linecap="round"/>
    <text x="16" y="150" fill="#cfe0ee" font-size="11" font-family="sans-serif">对流层</text>
    <text x="52" y="120" fill="#a9c4d8" font-size="10" font-family="sans-serif">平流层</text>
    <text x="96" y="96" fill="#8fa9bd" font-size="10" font-family="sans-serif">中间层</text>`;
  }

  /* 冰川极地：冰山海上/海下 + 企鹅点 */
  function ice(c) {
    return `
    <defs><linearGradient id="ic" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#13293f"/><stop offset="1" stop-color="#0a1626"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#ic)"/>
    <rect y="86" width="${W}" height="84" fill="#0f3350" opacity=".9"/>
    <path d="M92 86 L120 30 L150 60 L178 44 L206 86 Z" fill="#dfeef8"/>
    <path d="M120 86 L142 118 L168 96 L196 140 L206 86 Z" fill="#9cc8e4" opacity=".92"/>
    <path d="M98 84 q52 -8 106 2" stroke="#ffffff" stroke-width="2" fill="none" opacity=".7"/>
    <path d="M14 90 q40 -6 78 0 M210 92 q44 -6 82 0" stroke="#dfeef8" stroke-width="8" fill="none" opacity=".8"/>
    <path d="M250 150 q6 -16 12 0 z M266 152 q5 -13 10 0 z" fill="#1c2733"/>
    <circle cx="256" cy="132" r="4.6" fill="#1c2733"/><circle cx="272" cy="134" r="4" fill="#1c2733"/>
    <circle cx="40" cy="34" r="10" fill="#e8f2f8" opacity=".85"/><circle cx="64" cy="24" r="7" fill="#e8f2f8" opacity=".6"/>`;
  }

  /* 人类工程：城市天际线 + 大坝 */
  function human(c) {
    return `
    <defs><linearGradient id="hs" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#14243a"/><stop offset="1" stop-color="#1e3450"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#hs)"/>
    <circle cx="252" cy="36" r="14" fill="#ffd98a" opacity=".85"/>
    <g fill="#2c4a6e">
      <rect x="16" y="86" width="26" height="70"/><rect x="48" y="60" width="30" height="96"/>
      <rect x="84" y="98" width="22" height="58"/><rect x="110" y="72" width="28" height="84"/>
      <rect x="142" y="88" width="24" height="68"/>
    </g>
    <g fill="#FFD98a" opacity=".8">
      <rect x="54" y="68" width="4" height="4"/><rect x="64" y="80" width="4" height="4"/><rect x="118" y="80" width="4" height="4"/>
      <rect x="126" y="96" width="4" height="4"/><rect x="24" y="96" width="4" height="4"/><rect x="148" y="98" width="4" height="4"/>
    </g>
    <path d="M180 156 L180 84 Q180 70 196 70 L246 70 Q262 70 262 84 L262 156"
      stroke="#8fa9bd" stroke-width="6" fill="none"/>
    <path d="M196 156 L196 100 M246 156 L246 100" stroke="#8fa9bd" stroke-width="3"/>
    <rect x="176" y="70" width="90" height="8" rx="3" fill="#9CCC5E"/>
    <rect y="154" width="${W}" height="16" fill="#0c1a2c"/>
    <path d="M0 156 q70 -8 150 0 t155 0" stroke="#4da6dd" stroke-width="2.4" fill="none" opacity=".7"/>`;
  }

  /* 地球圈层：同心圆剖面 */
  function geo(c) {
    return `
    <rect width="${W}" height="${H}" fill="#0a1420"/>
    <g transform="translate(150,88)">
      <circle r="78" fill="#9a8a62" opacity=".35"/>
      <circle r="74" fill="#8a7a58" opacity=".5"/>
      <circle r="52" fill="#c85a38"/>
      <circle r="52" fill="none" stroke="#e8a06a" stroke-width="2" opacity=".6"/>
      <circle r="28" fill="#e8863a"/>
      <circle r="11" fill="#f5cf5e"/>
      <path d="M-78 0 A78 78 0 0 1 0 -78" stroke="#dfeef8" stroke-width="2.4" fill="none" opacity=".7"/>
      <path d="M0 26 A26 26 0 0 1 26 0" stroke="#fff" stroke-width="1.6" fill="none" opacity=".6"/>
    </g>
    <text x="196" y="52" fill="#f5cf5e" font-size="10.5" font-family="sans-serif">内核</text>
    <text x="216" y="84" fill="#e8863a" font-size="10.5" font-family="sans-serif">外核</text>
    <text x="234" y="116" fill="#c85a38" font-size="10.5" font-family="sans-serif">地幔</text>
    <text x="248" y="144" fill="#9a8a62" font-size="10.5" font-family="sans-serif">地壳</text>`;
  }

  /* kind 归类（与 markers.js 的 MODULE_KIND 同步） */
  function kindOf(poi) {
    return poi.kind || ({ interior: 'geo', plates: 'geo', volcano: 'volcano',
      ocean: 'ocean', climate: 'climate', landform: 'mountain', polar: 'ice',
      human: 'human', earth: 'geo' })[poi.module] || 'geo';
  }

  const KIND_FIG = {
    mountain, volcano, ocean, river, climate, ice, human, geo,
  };

  function make(kind, colorHex) {
    const gen = KIND_FIG[kind] || KIND_FIG.geo;
    const c = esc(colorHex || '#3DBE8B');
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" width="100%" preserveAspectRatio="xMidYMid slice">${gen(c)}</svg>`;
  }

  return { make, kindOf };
})();
