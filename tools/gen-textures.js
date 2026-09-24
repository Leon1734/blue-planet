#!/usr/bin/env node
/**
 * 生成 js/textures-data.js —— 把 textures/ 下的地球贴图内嵌为 base64 data URI。
 * 目的：file://（双击 index.html）场景下浏览器拒绝加载本地图片做 WebGL 纹理，
 *       内嵌进 JS 即可离线直开且不跨域。
 * 用法：node tools/gen-textures.js
 * 贴图来源：NASA 蓝色大理石风格昼夜/云图（复用工作区 altitude-journey 项目素材）；
 *          earth_topo.jpg 全球高程图（来源 three-globe 示例素材，陆地为海拔灰度、海洋为 0，
 *          经 cdn.jsdelivr.net 下载后在浏览器内重采样为 1024×512 JPEG）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILES = {
  day: 'textures/earth_day.jpg',
  night: 'textures/earth_night.png',
  clouds: 'textures/earth_clouds.png',
  topo: 'textures/earth_topo.jpg',
};
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

const parts = [];
for (const [key, rel] of Object.entries(FILES)) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    console.error(`缺少贴图：${rel}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(p);
  const mime = MIME[path.extname(p).toLowerCase()];
  parts.push(`  ${key}: 'data:${mime};base64,${buf.toString('base64')}'`);
}

const out = `/* ============================================================
   本文件由 tools/gen-textures.js 自动生成，请勿手改。
   再生成：node tools/gen-textures.js
   —— 地球昼夜/云贴图 base64 内嵌（file:// 双击直开必需）
   ============================================================ */

const BP_TEXTURE_DATA = {
${parts.join(',\n')},
};
`;

fs.writeFileSync(path.join(ROOT, 'js/textures-data.js'), out);
const kb = (fs.statSync(path.join(ROOT, 'js/textures-data.js')).size / 1024).toFixed(0);
console.log(`已生成 js/textures-data.js（${kb} KB）`);
