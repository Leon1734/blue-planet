#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v19 内容重放：+12 POI / +20 题库 / +8 冷知识 / +8 KB / +8 日历"""
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

def ins_append_arr(arr_name, block, name):
    global s
    if block.split('\n')[0].strip()[:30] in s:
        FIX.append('·· 已存在 ' + name)
        return
    key = 'const ' + arr_name + ' = ['
    if key not in s:
        FIX.append('!! 数组缺失 ' + name)
        return
    start = s.index(key)
    close = s.index('\n];', start)
    items = block.rstrip()
    if not items.endswith(','):
        items += ','
    s = s[:close] + '\n' + items + s[close:]
    FIX.append('✓ ' + name)

exec(io.open('tools/v19-blocks.py', encoding='utf-8').read())

ins_before_line('  /* ===== 极地与冰川 ===== */', POIS, 'POI+12')
ins_append_arr('BP_QUIZ', QUIZ, '题库+20')
ins_append_arr('BP_FACTS', FACTS, '冷知识+8')
ins_append_arr('BP_CHAT_KB', KB, 'KB+8')
ins_append_arr('BP_CALENDAR', CAL, '日历+8')

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('\n'.join(FIX))
