#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v16 内容重放：KB +10 条（世界奇观篇对应问答）"""
import io

p = 'js/data.js'
s = io.open(p, encoding='utf-8').read()
FIX = []

def ins_after_line(anchor_sub, block, name):
    global s
    if anchor_sub not in s:
        FIX.append('!! 锚点缺失 ' + name)
        return
    if block.split('\n')[0].strip()[:30] in s:
        FIX.append('·· 已存在 ' + name)
        return
    idx = s.index(anchor_line)
    end = s.index('\n', idx) + 1
    s = s[:end] + block + '\n' + s[end:]
    FIX.append('✓ ' + name)

exec(io.open('tools/v16-blocks.py', encoding='utf-8').read())

# KB：插在 深时 条目后
ins_after_line("  { k: ['深时', '大陆漂移', '盘古']", KB, 'KB+10')

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('\n'.join(FIX))
