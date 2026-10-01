#!/usr/bin/env node
/**
 * BluePlanet 内容校验器（v6 / N3）
 * 用法：node tools/validate-data.js
 * 校验 js/data.js 的内容质量：坐标/重复 id/引用完整性/文案长度/英文残留/
 * 题库结构/日历 poi/速览映射/深时纪元 id。CI（GitHub Actions）与本机通用。
 * 退出码：0=全部通过，1=存在错误（warning 不影响退出码）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const errors = [];
const warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);

/* ---------- 载入 data.js（vm 沙箱） ---------- */
const vm = require('vm');
const ctx = vm.createContext({ console });
let D;
try {
  const src = fs.readFileSync(path.join(ROOT, 'js/data.js'), 'utf8')
    + '\n' + (fs.existsSync(path.join(ROOT, 'js/deeptime-data.js'))
      ? fs.readFileSync(path.join(ROOT, 'js/deeptime-data.js'), 'utf8') : '');
  vm.runInContext(src + `;
  globalThis.__D = { BP_MODULES, BP_POIS, BP_LABELS, BP_FACTS, BP_DAY24, BP_PLATES,
    BP_RIVERS, BP_CURRENTS, BP_WINDS, BP_EARTH_LAYERS, BP_TOURS, BP_QUIZ,
    BP_CHAT_KB, BP_CALENDAR, BP_MONTH_FOCUS, BP_STATS, BP_DEEPTIME, BP_DEEPTIME_ORDER };`, ctx);
  D = ctx.__D;
} catch (e) {
  console.error('❌ data.js 语法错误：', e.message);
  process.exit(1);
}

/* ---------- 1. 模块与知识点 ---------- */
const modIds = new Set(D.BP_MODULES.map(m => m.id));
const poiIds = new Set();
for (const p of D.BP_POIS) {
  if (poiIds.has(p.id)) err(`POI 重复 id: ${p.id}`);
  poiIds.add(p.id);
  for (const k of ['id', 'module', 'title', 'lat', 'lon', 'difficulty', 'tags', 'summary', 'content'])
    if (p[k] === undefined) err(`POI ${p.id} 缺字段 ${k}`);
  if (!modIds.has(p.module)) err(`POI ${p.id} 引用未知模块 ${p.module}`);
  if (Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) err(`POI ${p.id} 坐标越界 (${p.lat},${p.lon})`);
  if (![1, 2, 3].includes(p.difficulty)) err(`POI ${p.id} difficulty 越界`);
  if (p.content.join('').length < 100) warn(`POI ${p.id} 正文偏短（<100 字）`);
  if (p.content.join('').length > 700) warn(`POI ${p.id} 正文偏长（>700 字）`);
  const EN = /\b(global|permanently|leftover|itself|burning)\b/i;
  for (const para of p.content) if (EN.test(para)) warn(`POI ${p.id} 疑似英文残留: ${para.slice(0, 20)}…`);
  if (p.kind && !['mountain', 'volcano', 'ocean', 'river', 'climate', 'geo', 'ice', 'human'].includes(p.kind))
    err(`POI ${p.id} kind 非法: ${p.kind}`);
}
for (const m of D.BP_MODULES) {
  const n = D.BP_POIS.filter(p => p.module === m.id).length;
  if (n === 0) warn(`模块 ${m.id} 没有任何知识点`);
  if (m.id === 'earth' && n < 10) warn(`地球档案应 ≥10 POI，当前 ${n}`);
}

/* ---------- 2. 引用完整性（日历/速览/冷知识/巡礼/KB） ---------- */
for (const c of D.BP_CALENDAR) {
  if (!/^\d{2}-\d{2}$/.test(c.md)) err(`日历日期格式错: ${c.md}`);
  if (c.poi && !poiIds.has(c.poi)) err(`日历 ${c.md} poi 缺失: ${c.poi}`);
}
for (const [k] of Object.entries(D.BP_STATS)) {
  if (!poiIds.has(k)) err(`BP_STATS 引用缺失 POI: ${k}`);
}
for (const f of D.BP_FACTS) {
  const t = typeof f === 'string' ? f : f.t;
  const poi = typeof f === 'object' ? f.poi : null;
  if (poi && !poiIds.has(poi)) err(`冷知识 poi 缺失: ${poi}（${t.slice(0, 16)}…）`);
}
for (const t of D.BP_TOURS) for (const s of t.stops) {
  if (!poiIds.has(s)) err(`巡礼 ${t.id} 站点缺失: ${s}`);
}
for (const q of D.BP_QUIZ) {
  if (q.a.length !== 4) err(`题库选项数≠4: ${q.q.slice(0, 14)}…`);
  if (q.c < 0 || q.c > 3) err(`题库答案索引越界: ${q.q.slice(0, 14)}…`);
  if (!modIds.has(q.m)) err(`题库模块非法: ${q.m}`);
}

/* ---------- 3. 地理数据 ---------- */
for (const r of D.BP_RIVERS) for (const [la, lo] of r.pts) {
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) err(`河流 ${r.t} 坐标越界`);
}
for (const key of ['convergent', 'divergent']) for (const line of D.BP_PLATES[key]) for (const [la, lo] of line) {
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) err(`板块折线坐标越界 (${la},${lo})`);
}
for (const e of D.BP_DEEPTIME) {
  for (const poly of e.continents) for (const [la, lo] of poly) {
    if (Math.abs(la) > 90 || Math.abs(lo) > 180) err(`深时 ${e.id} 坐标越界 (${la},${lo})`);
  }
}
const dtIds = new Set(D.BP_DEEPTIME.map(e => e.id));
for (const id of D.BP_DEEPTIME_ORDER) if (!dtIds.has(id)) err(`BP_DEEPTIME_ORDER 引用缺失纪元: ${id}`);

/* ---------- 4. 地名标注 ---------- */
const labelSeen = new Set();
for (const L of D.BP_LABELS) {
  const key = L.t + '@' + L.lat;
  if (labelSeen.has(key)) warn(`地名疑似重复: ${L.t}`);
  labelSeen.add(key);
  if (Math.abs(L.lat) > 90 || Math.abs(L.lon) > 180) err(`地名坐标越界: ${L.t}`);
  if (![1, 2, 3].includes(L.z)) err(`地名 LOD 非法: ${L.t}`);
}

/* ---------- 汇总 ---------- */
console.log('─'.repeat(46));
console.log(`BluePlanet 内容校验`);
console.log(`POI ${D.BP_POIS.length} · 模块 ${D.BP_MODULES.length} · 地名 ${D.BP_LABELS.length} · 冷知识 ${D.BP_FACTS.length} · 题库 ${D.BP_QUIZ.length} · 日历 ${D.BP_CALENDAR.length}`);
console.log('─'.repeat(46));
if (warns.length) {
  console.log(`⚠️ 警告 ${warns.length} 条：`);
  warns.slice(0, 12).forEach(w => console.log('  ⚠ ' + w));
  if (warns.length > 12) console.log(`  … 等共 ${warns.length} 条`);
}
if (errors.length) {
  console.log(`❌ 错误 ${errors.length} 条：`);
  errors.slice(0, 20).forEach(e => console.log('  ✗ ' + e));
  process.exit(1);
}
console.log('✅ 校验全部通过');
