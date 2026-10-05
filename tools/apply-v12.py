#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v12 内容重放：追加 15 POI / 16 地名 / 11 冷知识 / 13 日历 / 20 题库 / 10 KB"""
import io

p = 'js/data.js'
s = io.open(p, encoding='utf-8').read()
FIX = []

def ins_after_line(anchor_line, block, name):
    global s
    if anchor_line not in s:
        FIX.append('!! 锚点缺失 ' + name)
        return
    if block.split('\n')[0].strip()[:30] in s:
        FIX.append('·· 已存在 ' + name)
        return
    idx = s.index(anchor_line)
    end = s.index('\n', idx) + 1
    s = s[:end] + block + '\n' + s[end:]
    FIX.append('✓ ' + name)

def ins_before_line(anchor_line, block, name):
    global s
    if anchor_line not in s:
        FIX.append('!! 锚点缺失 ' + name)
        return
    if block.split('\n')[0].strip()[:30] in s:
        FIX.append('·· 已存在 ' + name)
        return
    idx = s.index(anchor_line)
    s = s[:idx] + block + '\n' + s[idx:]
    FIX.append('✓ ' + name)

exec(io.open('tools/v12-blocks.py', encoding='utf-8').read())

# A. 15 POI：插在 极地与冰川 注释前
ins_before_line('  /* ===== 极地与冰川 ===== */', POIS, 'POI+15')

# B. 16 地名：插在 阿特拉斯山脉北支 行后
ins_after_line("  { t: '阿特拉斯山脉', lat: 31, lon: -6, k: 'range', z: 2 },", LABELS, '地名+16')

# C. 11 冷知识：插在 急流 行后
ins_after_line("  { t: '北极航道通航期从几乎为零延长到 100+ 天——海冰是航运成本的变量器。', poi: 'arctic-shipping' },", FACTS, '冷知识+11')

# D. 13 日历：插在 暗夜保护日 行后
ins_after_line("  { md: '04-30', t: '暗夜保护日', d: '全球八成人口已看不到银河——灯光污染是最新的大气议题。' },", CAL, '日历+13')

# E. 20 题库：插在 陨石 题行后
ins_after_line("e: '冰盖像传送带把陨石送到山前蓝冰区——黑色陨石在蓝白冰上格外显眼。' },", QUIZ, '题库+20')

# F. 10 KB：插在 堪察加 条目后
ins_after_line("  { k: ['急流', '高空风'], a: '万米高空有条风速可达 400 km/h 的\"大气河流\"——跨太平洋东行航班快 1~2 小时就是蹭了它。急流蛇形化还会引发极端寒潮。', poi: 'jet-stream' },", KB, 'KB+10')

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('\n'.join(FIX))
