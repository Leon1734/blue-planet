#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v9 内容重放：向 js/data.js 追加 15 POI / 15 地名 / 9 冷知识 / 17 日历 / 20 题库 / 9 KB"""
import io

p = 'js/data.js'
s = io.open(p, encoding='utf-8').read()
FIX = []

def ins_after_line(anchor_line, block, name):
    global s
    if anchor_line not in s:
        FIX.append('!! 锚点缺失 ' + name)
        return
    if block.split('\n')[0].strip()[:40] in s:
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
    if block.split('\n')[0].strip()[:40] in s:
        FIX.append('·· 已存在 ' + name)
        return
    idx = s.index(anchor_line)
    s = s[:idx] + block + '\n' + s[idx:]
    FIX.append('✓ ' + name)

exec(io.open('tools/v9-blocks.py', encoding='utf-8').read())

# A. 15 POI：插在 极地与冰川 注释前
ins_before_line('  /* ===== 极地与冰川 ===== */', POIS, 'POI+15')

# B. 15 地名：插在 育空河 行后
ins_after_line("  { t: '育空河', lat: 62.5, lon: -160.0, k: 'river', z: 3 },", LABELS, '地名+15')

# C. 9 冷知识：插在 709 千米 行后
ins_after_line("  { t: '有记录的最长闪电横跨美国七个州、长达 709 千米（2020 年 WMO 纪录）。', poi: null },", FACTS, '冷知识+9')

# D. 17 日历：插在 极地探索季 行后
ins_after_line('  { md: \'12-25\', t: \'极地探索季\', d: \'南极正值极昼暖季，各国科考站的"建设黄金期"；北极点则沉入漫漫极夜。\', poi: \'south-pole\' },', CAL, '日历+17')

# E. 20 题库：插在 暗淡蓝点 题行后
ins_after_line("e: '旅行者 1 号在 64 亿千米外回望地球", QUIZ, '题库+20')

# F. 9 KB：插在 随机 条目后
ins_after_line("  { k: ['随机', '手气', '抽一个'], a: '按 R 键或点顶部「🎲 随机」：一键飞达任意知识点！还能选\"未打卡优先\"专门补新知识，或开启「随机漫游」每 12 秒自动逛一站～', },", KB, 'KB+9')

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('\n'.join(FIX))
