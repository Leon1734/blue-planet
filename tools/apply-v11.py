#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v11 内容重放：追加 15 POI / 16 地名 / 10 冷知识 / 17 日历 / 20 题库 / 10 KB"""
import io

p = 'js/data.js'
s = io.open(p, encoding='utf-8').read()
FIX = []

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

exec(io.open('tools/v11-blocks.py', encoding='utf-8').read())

# A. 15 POI：插在 极地与冰川 注释前
ins_before_line('  /* ===== 极地与冰川 ===== */', POIS, 'POI+15')

# B. 16 地名：插在 波河平原 行后
ins_after_line("  { t: '波河平原', lat: 45.1, lon: 10.5, k: 'plain', z: 3 },", LABELS, '地名+16')

# C. 10 冷知识：插在 碳循环 行后
ins_after_line("  { t: '地球的碳循环自带\"恒温器\"：火山放碳变暖→风化加快埋碳变冷——亿年尺度的负反馈。', poi: 'carbon-cycle' },", FACTS, '冷知识+10')

# D. 17 日历：插在 暗夜保护日 行后
ins_after_line("  { md: '04-30', t: '暗夜保护日', d: '全球八成人口已看不到银河——灯光污染是最新的大气议题。' },", CAL, '日历+17')

# E. 20 题库：插在 大气氮气 题行后
ins_after_line("e: '氮气约占 78%——大气主体是\"惰性背景\"，活跃成分才塑造天气。' },", QUIZ, '题库+20')

# F. 10 KB：插在 深时 条目后
ins_after_line("  { k: ['深时', '大陆漂移', '盘古'], a: '点顶部「🦕 深时」：回看 5 亿年的大陆漂移——从寒武纪的海洋世界到盘古大陆再到今天的七大洲。每个纪元都配了大气与生命的知识卡！', },", KB, 'KB+10')

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('\n'.join(FIX))
