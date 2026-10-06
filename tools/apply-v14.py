#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v14 内容重放：追加 15 POI / 16 地名 / 11 冷知识 / 13 日历 / 20 题库 / 10 KB"""
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

exec(io.open('tools/v14-blocks.py', encoding='utf-8').read())

# A. 15 POI：插在 极地与冰川 注释前
ins_before_line('  /* ===== 极地与冰川 ===== */', POIS, 'POI+15')

# B. 16 地名：插在 加拿大北极群岛 行后
ins_after_line("  { t: '加拿大北极群岛', lat: 75.0, lon: -95.0, k: 'island', z: 3 },", LABELS, '地名+16')

# C. 11 冷知识：插在 科莫多 行后
ins_after_line("  { t: '科莫多巨蜥 3 米长 90 千克——孤岛上没有竞争者，\"大\"就成了生存策略。', poi: 'komodo' },", FACTS, '冷知识+11')

# D. 13 日历：插在 国际移民日 行后
ins_after_line("  { md: '12-18', t: '国际移民日', d: '全球国际移民约 2.8 亿——人口流动是地理学最古老的话题之一。' },", CAL, '日历+13')

# E. 20 题库：插在 陨石 题行后
ins_after_line("e: '冰盖像传送带把陨石送到山前蓝冰区——黑色陨石在蓝白冰上格外显眼。' },", QUIZ, '题库+20')

# F. 10 KB：插在 堪察加 条目后
ins_after_line("  { k: ['堪察加', '火山半岛'], a: '俄罗斯堪察加半岛挤着约 300 座火山、29 座活火山——克柳切夫是欧亚最高活火山。上万头棕熊在火山脚下的湖里捕鲑鱼。', poi: 'kamchatka' },", KB, 'KB+10')

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('\n'.join(FIX))
