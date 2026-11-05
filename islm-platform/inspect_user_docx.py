# -*- coding: utf-8 -*-
"""检查用户手工修订版 docx 的正文段落与参考文献结构，定位新引用锚点。"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

from docx import Document

SRC = r"c:\Users\周\Desktop\智慧教与学大赛学生组征文_AI赋能研究性学习_v2_参考文献修订.docx"

doc = Document(SRC)

print("=== 正文段落（含 [n] 引用的与关键锚点句） ===")
for i, p in enumerate(doc.paragraphs):
    t = p.text.strip()
    if not t:
        continue
    hit = ("[" in t and "]" in t) or any(k in t for k in
        ["四大目标", "仿真器复现验证", "降级被完整记录", "可仿真学科", "参考文献"])
    if hit:
        print(f"--- para {i} (style={p.style.name}) ---")
        print(t[:400])
        for j, r in enumerate(p.runs):
            print(f"    run{j}: bold={r.bold} sup={r.font.superscript} font={r.font.name} size={r.font.size} | {r.text[:80]!r}")

print("\n=== 参考文献段（末尾 20 段） ===")
paras = doc.paragraphs
for i in range(max(0, len(paras) - 20), len(paras)):
    t = paras[i].text.strip()
    if t:
        print(f"para {i}: {t[:120]}")
        if paras[i].runs:
            r = paras[i].runs[0]
            print(f"    first run: font={r.font.name} size={r.font.size} bold={r.bold}")
