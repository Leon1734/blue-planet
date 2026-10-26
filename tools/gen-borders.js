#!/usr/bin/env node
/**
 * 生成 js/borders-data.js —— Natural Earth 110m 国界/海岸线折线（零依赖）。
 * 数据源：world-atlas@2 countries-110m.json（TopoJSON，NASA 河流式弧段 + 增量编码）。
 * 用法：node tools/gen-borders.js
 * 输出：BP_BORDERS = [ [lon*10, lat*10, lon*10, lat*10, ...], ... ]
 *       每个元素是一条闭环/开环折线的扁平整数数组（0.1° 量化，与 110m 精度匹配）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(__dirname, 'data', 'countries-110m.json');

const topo = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const [sx, sy] = topo.transform.scale;
const [tx, ty] = topo.transform.translate;

/* 解码一条弧段：增量坐标 → 绝对经纬度 */
function decodeArc(arc) {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => {
    x += dx; y += dy;
    return [x * sx + tx, y * sy + ty];
  });
}
const arcs = topo.arcs.map(decodeArc);

/* 按 TopoJSON 规则拼接环：负索引取反向弧，后继弧跳过重复首点 */
function ringPoints(arcIdxs) {
  const pts = [];
  for (let i of arcIdxs) {
    let a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
    if (pts.length) a = a.slice(1);
    for (const [lon, lat] of a) pts.push(lon, lat);
  }
  return pts;
}

const rings = [];
const geoms = topo.objects.countries.geometries;
let ptTotal = 0;
for (const g of geoms) {
  const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
  for (const poly of polys) {
    for (const ring of poly) {           // 外环 + 内环（飞地）都画
      const flat = ringPoints(ring).map(v => Math.round(v * 10));
      if (flat.length >= 6) { rings.push(flat); ptTotal += flat.length / 2; }
    }
  }
}

const out = `/* ============================================================
   本文件由 tools/gen-borders.js 自动生成，请勿手改。
   再生成：node tools/gen-borders.js
   —— Natural Earth 110m 国界+海岸线（world-atlas countries-110m）
      扁平折线数组，坐标 ×10 取整（0.1° 量化）
   ============================================================ */

const BP_BORDERS = [
${rings.map(r => '[' + r.join(',') + ']').join(',\n')},
];
`;

fs.writeFileSync(path.join(ROOT, 'js/borders-data.js'), out);
const kb = (fs.statSync(path.join(ROOT, 'js/borders-data.js')).size / 1024).toFixed(0);
console.log(`已生成 js/borders-data.js：${rings.length} 条折线，${ptTotal} 个顶点（${kb} KB）`);
