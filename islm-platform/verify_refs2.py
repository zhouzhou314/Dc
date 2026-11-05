# -*- coding: utf-8 -*-
"""校验修订2版 docx：锚点句文本、上标引用、表格图片完好性。"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

from docx import Document

DST = r"c:\Users\周\Desktop\智慧教与学大赛学生组征文_AI赋能研究性学习_v2_参考文献修订2.docx"
SRC = r"c:\Users\周\Desktop\智慧教与学大赛学生组征文_AI赋能研究性学习_v2_参考文献修订.docx"

new = Document(DST)
old = Document(SRC)

print("=== 修改后的 4 个锚点段落 ===")
for i in (32, 44, 50, 56):
    p = new.paragraphs[i]
    print(f"--- para {i} ---")
    print(p.text)
    sups = [r.text for r in p.runs if r.font.superscript and r.text.strip()]
    print("上标 run:", sups)
    print()

print("=== 完好性对比 ===")
print(f"表格数: 原 {len(old.tables)} → 新 {len(new.tables)}")
imgs_new = len(new.part.package.image_parts) if hasattr(new.part, 'package') else '?'
print(f"内嵌图片数: 原 {len(old.part.package.image_parts)} → 新 {imgs_new}")
print(f"段落总数: 原 {len(old.paragraphs)} → 新 {len(new.paragraphs)}")
