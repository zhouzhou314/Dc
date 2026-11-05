# -*- coding: utf-8 -*-
"""在用户手工修订版 docx 中插入 4 条 2024-2026 新文献：
正文 4 处锚点插上标引用 [12]-[15]，参考文献列表末尾追加 4 条 GB/T 7714 条目。
另存新文件，不覆盖原件。"""
import sys, io, copy
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

from docx import Document
from docx.oxml.ns import qn

SRC = r"c:\Users\周\Desktop\智慧教与学大赛学生组征文_AI赋能研究性学习_v2_参考文献修订.docx"
DST = r"c:\Users\周\Desktop\智慧教与学大赛学生组征文_AI赋能研究性学习_v2_参考文献修订2.docx"

NEW_REFS = [
    "HASHIMZADE N, KIRSANOV O, KIRSANOVA T. Lucas Islands game in intermediate macroeconomics[J]. The Journal of Economic Education, 2026, 57(2): 236-254.",
    "LIU S, GUO X, HU X, et al. Advancing generative intelligent tutoring systems with GPT-4: Design, evaluation, and a modular framework for future learning platforms[J]. Electronics, 2024, 13(24): 4876.",
    "HUANG L, YU W, MA W, et al. A survey on hallucination in large language models: Principles, taxonomy, challenges, and open questions[J]. ACM Transactions on Information Systems, 2025, 43(2): 42.",
    "刘明，郭烁，吴忠明，等. 生成式人工智能重塑高等教育形态：内容、案例与路径[J]. 电化教育研究, 2024, 45(6): 57-65.",
]

doc = Document(SRC)
paras = doc.paragraphs

# ---------- 1. 找上标模板 run（para 26 的 '[11]'） ----------
sup_template = None
for r in paras[26].runs:
    if r.text == "[11]" and r.font.superscript:
        sup_template = copy.deepcopy(r._r)
        break
assert sup_template is not None, "未找到 [11] 上标模板 run"

def make_sup(mark):
    """基于模板生成一个上标引用 run 元素。"""
    el = copy.deepcopy(sup_template)
    for t in el.findall(qn("w:t")):
        el.remove(t)
    t = el.makeelement(qn("w:t"), {})
    t.text = mark
    t.set(qn("xml:space"), "preserve")
    el.append(t)
    return el

def set_text(el, text):
    """清空 run 元素文本并写入新文本。"""
    for t in el.findall(qn("w:t")):
        el.remove(t)
    t = el.makeelement(qn("w:t"), {})
    t.text = text
    t.set(qn("xml:space"), "preserve")
    el.append(t)

def insert_mark(para, run, before, mark):
    """把 run 拆为 before + 上标(mark) + 剩余，保持原格式。"""
    r = run._r
    rest = run.text[len(before):]
    assert run.text.startswith(before), f"锚点不匹配: {run.text[:40]!r}"
    set_text(r, before)
    sup = make_sup(mark)
    r.addnext(sup)
    if rest:
        rest_r = copy.deepcopy(r)
        set_text(rest_r, rest)
        sup.addnext(rest_r)

# ---------- 2. 四处正文插入 ----------
# para 32 博弈段：…四大目标 | [12] | （空run14）。（图3）
p32 = paras[32]
insert_mark(p32, p32.runs[13], "目标", "[12]")

# para 44 第四步：…并用仿真器复现验证 | [13] | 。
p44 = paras[44]
insert_mark(p44, p44.runs[10], "解析对照核对，并用仿真器复现验证", "[13]")

# para 50 泄露案例：…降级被完整记录 | [14] | （空run5）。（图5）
p50 = paras[50]
insert_mark(p50, p50.runs[4],
            "，校验立即拦截→提醒重试→仍不合格→自动降级直出知识卡，全程无答案外泄且降级被完整记录",
            "[14]")

# para 56 推广段：…等可仿真学科 | [15] | 。沿同一思路…
p56 = paras[56]
insert_mark(p56, p56.runs[8], "、化学平衡、物理电路等可仿真学科", "[15]")

# ---------- 3. 参考文献末尾追加 4 条 ----------
last_ref = paras[72]  # WANG L ... 自主智能体条目（列表最后一条）
cursor = last_ref._p
for txt in NEW_REFS:
    new_p = copy.deepcopy(cursor)          # 复制段落（含 numPr 自动编号、缩进等）
    for r in new_p.findall(qn("w:r")):     # 清空所有 run
        new_p.remove(r)
    cursor.addnext(new_p)
    cursor = new_p
    from docx.text.paragraph import Paragraph
    pobj = Paragraph(new_p, last_ref._parent)
    run = pobj.add_run(txt)
    run.font.name = "宋体"
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), "宋体")

doc.save(DST)
print("已保存：", DST)

# ---------- 4. 快速自检 ----------
chk = Document(DST)
text_all = "\n".join(p.text for p in chk.paragraphs)
refs = [p.text.strip() for p in chk.paragraphs
        if p.style.name == "List Paragraph" and p.text.strip()]
print("参考文献条数：", len(refs))
print("最后 4 条：")
for t in refs[-4:]:
    print("  ", t[:90])
import re
marks = re.findall(r"\[(\d+)\]", text_all)
seen = []
for m in marks:
    if int(m) not in seen:
        seen.append(int(m))
print("正文引用首现顺序：", sorted(seen))
