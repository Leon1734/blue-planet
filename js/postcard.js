/* ============================================================
   BluePlanet 明信片生成（v27）
   - 把当前地球视图 + 知识点信息合成为竖版 PNG 明信片
   - 渲染后同 tick 同步取样（渲染器未开 preserveDrawingBuffer）
   - 纯 Canvas 2D 合成，零依赖；file:// 下贴图为 base64 无污染
   ============================================================ */

const BPPostcard = (() => {

  const W = 1080, H = 1440;   // 3:4 竖版，适合聊天分享

  /* 中文按宽度折行；超行截断加省略号 */
  function wrap(ctx, text, maxW, maxLines) {
    const lines = [];
    let line = '';
    for (const ch of text) {
      if (line && ctx.measureText(line + ch).width > maxW) {
        lines.push(line);
        line = ch;
        if (lines.length === maxLines) {
          lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
          return lines;
        }
      } else line += ch;
    }
    if (line) lines.push(line);
    return lines;
  }

  function pill(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* 公共底版：底色 + 地球快照 + 渐变过渡 + 描边（make / makeFact 共用） */
  function drawShell(ctx, strokeColor) {
    ctx.fillStyle = '#0D1B2A';
    ctx.fillRect(0, 0, W, H);
    const imgH = Math.round(H * 0.72);
    const gl = document.getElementById('scene');
    if (gl && gl.width > 2) {
      const scale = Math.max(W / gl.width, imgH / gl.height);
      const dw = gl.width * scale, dh = gl.height * scale;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, imgH); ctx.clip();
      ctx.drawImage(gl, (W - dw) / 2, (imgH - dh) / 2, dw, dh);
      ctx.restore();
    }
    /* 快照底缘渐变入底色 */
    const g = ctx.createLinearGradient(0, imgH - 280, 0, imgH);
    g.addColorStop(0, 'rgba(13,27,42,0)');
    g.addColorStop(1, 'rgba(13,27,42,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, imgH - 280, W, 280);

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(26, 26, W - 52, H - 52);
    return imgH;
  }

  /* 公共页脚：分隔线 + 品牌 + 站址日期 */
  function drawFooter(ctx) {
    const d = new Date();
    ctx.strokeStyle = 'rgba(122,178,214,0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(64, H - 110); ctx.lineTo(W - 64, H - 110); ctx.stroke();
    ctx.textBaseline = 'middle';
    ctx.font = '600 26px "Microsoft YaHei","PingFang SC",sans-serif';
    ctx.fillStyle = '#C9DAE8';
    ctx.fillText('🌍 蓝色星球 · 会转的地理课本', 64, H - 62);
    ctx.textAlign = 'right';
    ctx.font = '400 22px "Microsoft YaHei","PingFang SC",sans-serif';
    ctx.fillStyle = '#7D97AD';
    ctx.fillText(`leon1734.github.io/blue-planet · ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, W - 64, H - 62);
    ctx.textAlign = 'left';
  }

  function download(ctx, name) {
    const a = document.createElement('a');
    a.href = ctx.canvas.toDataURL('image/png');
    a.download = name;
    a.click();
    if (typeof BPPanels !== 'undefined' && BPPanels.toast) BPPanels.toast('📷 明信片已生成并下载');
  }

  function make(poi) {
    try {
      /* 1. 现渲一帧并同 tick 取样（避免后台/节流取到空缓冲） */
      if (typeof BPScene !== 'undefined') BPScene.render();

      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      const mod = (typeof BP_MODULES !== 'undefined') ? BP_MODULES.find(m => m.id === poi.module) : null;
      const modColor = mod ? mod.color : '#8FC8E8';

      /* 2. 底版 + 地球快照 */
      const imgH = drawShell(ctx, modColor);

      /* 4. 信息区：模块胶囊 + 难度星 */
      let y = imgH + 66;
      ctx.font = '500 26px "Microsoft YaHei","PingFang SC",sans-serif';
      const modName = mod ? mod.name : '地理知识';
      const pillW = ctx.measureText(modName).width + 48;
      ctx.strokeStyle = modColor;
      ctx.lineWidth = 2.5;
      pill(ctx, 64, y, pillW, 50, 25); ctx.stroke();
      ctx.fillStyle = modColor;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(modName, 64 + 24, y + 26);
      /* 难度星（右上） */
      if (poi.difficulty) {
        ctx.textAlign = 'right';
        ctx.font = '30px sans-serif';
        ctx.fillStyle = '#FFD24A';
        ctx.fillText('★'.repeat(poi.difficulty) + '☆'.repeat(Math.max(0, 3 - poi.difficulty)), W - 64, y + 26);
        ctx.textAlign = 'left';
      }

      /* 5. 标题（最多 2 行） */
      y += 108;
      ctx.font = '700 58px "Microsoft YaHei","PingFang SC",sans-serif';
      ctx.fillStyle = '#F2F8FD';
      const titleLines = wrap(ctx, poi.title, W - 128, 2);
      for (const ln of titleLines) { ctx.fillText(ln, 64, y + 28); y += 76; }

      /* 6. 摘要（最多 3 行） */
      y += 16;
      ctx.font = '400 28px "Microsoft YaHei","PingFang SC",sans-serif';
      ctx.fillStyle = '#AFC6D9';
      for (const ln of wrap(ctx, poi.summary || '', W - 128, 3)) { ctx.fillText(ln, 64, y + 14); y += 44; }

      /* 7. 坐标 + 打卡/收藏状态 */
      y += 34;
      ctx.font = '400 24px "Microsoft YaHei","PingFang SC",sans-serif';
      ctx.fillStyle = '#7D97AD';
      const latStr = `${Math.abs(poi.lat).toFixed(1)}°${poi.lat >= 0 ? 'N' : 'S'}`;
      const lonStr = `${Math.abs(poi.lon).toFixed(1)}°${poi.lon >= 0 ? 'E' : 'W'}`;
      let stat = `📍 ${latStr}, ${lonStr}`;
      const pf = (typeof BPGame !== 'undefined') ? BPGame.profile : null;
      if (pf && pf.visited && pf.visited.includes(poi.id)) stat += '   ✓ 已点亮';
      if (pf && pf.favs && pf.favs.includes(poi.id)) stat += '   ⭐ 已收藏';
      ctx.fillText(stat, 64, y + 12);

      /* 8. 页脚 + 下载 */
      drawFooter(ctx);
      download(ctx, `蓝色星球_${poi.title}.png`);
      return true;
    } catch (e) {
      if (typeof BPPanels !== 'undefined' && BPPanels.toast) BPPanels.toast('📷 生成失败：' + (e.message || '画布不可用'));
      return false;
    }
  }

  /* v33 冷知识明信片：地球快照 + 💡 冷知识正文 */
  function makeFact(factText) {
    try {
      if (typeof BPScene !== 'undefined') BPScene.render();
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      const imgH = drawShell(ctx, '#FFD24A');   // 冷知识金色描边

      /* 💡 徽标胶囊 */
      let y = imgH + 66;
      ctx.font = '500 26px "Microsoft YaHei","PingFang SC",sans-serif';
      const label = '💡 冷知识';
      const pillW = ctx.measureText(label).width + 48;
      ctx.strokeStyle = '#FFD24A';
      ctx.lineWidth = 2.5;
      pill(ctx, 64, y, pillW, 50, 25); ctx.stroke();
      ctx.fillStyle = '#FFD24A';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(label, 64 + 24, y + 26);

      /* 冷知识正文（最多 8 行） */
      y += 118;
      ctx.font = '600 40px "Microsoft YaHei","PingFang SC",sans-serif';
      ctx.fillStyle = '#F2F8FD';
      for (const ln of wrap(ctx, factText || '', W - 128, 8)) { ctx.fillText(ln, 64, y + 20); y += 62; }

      drawFooter(ctx);
      download(ctx, '蓝色星球_冷知识.png');
      return true;
    } catch (e) {
      if (typeof BPPanels !== 'undefined' && BPPanels.toast) BPPanels.toast('📷 生成失败：' + (e.message || '画布不可用'));
      return false;
    }
  }

  return { make, makeFact };
})();
